"""
Business: Админ API — CRUD объявлений, управление лидами, пользователями, страницами, настройками сайта и телефонной базой с проверкой ролей.
Args: event с httpMethod, queryStringParameters {resource, id, action}, body, headers X-Auth-Token; context
Returns: HTTP-ответ с данными ресурса или ошибкой прав
"""

import json
import os
from datetime import datetime

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


# Антиспам для уведомлений об ошибках: одинаковый текст не чаще раза в 5 минут.
_ERROR_REPORT_LAST = {}


def _error_report(cur, event):
    """Приём клиентской (frontend) ошибки и отправка письма админам через SMTP.

    Всегда возвращает 200, чтобы не ломать фронт. Если SMTP не настроен —
    тихо выходит. Защищён троттлингом от спама одинаковыми ошибками.
    """
    import smtplib
    from datetime import timezone
    from email.mime.text import MIMEText

    try:
        data = json.loads(event.get('body') or '{}')
    except Exception:
        data = {}

    message = str(data.get('message') or 'Неизвестная ошибка')[:500]
    page_url = str(data.get('url') or '')[:300]
    stack = str(data.get('stack') or '')[:2000]
    user_agent = str(data.get('userAgent') or '')[:300]

    now_ts = datetime.now(timezone.utc).timestamp()
    key = message[:120]
    if now_ts - _ERROR_REPORT_LAST.get(key, 0) < 300:
        return _ok({'sent': False, 'throttled': True})

    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    s = cur.fetchone() or {}

    recipients = (s.get('notify_email_recipients') or '').strip()
    host = (s.get('smtp_host') or '').strip()
    port = s.get('smtp_port') or 465
    smtp_user = (s.get('smtp_user') or '').strip()
    smtp_pass = s.get('smtp_password') or ''
    smtp_from = (s.get('smtp_from') or smtp_user or '').strip()
    company = s.get('company_name') or 'сайт'

    if not (recipients and host and smtp_user and smtp_pass):
        return _ok({'sent': False, 'reason': 'smtp_not_configured'})

    to_list = [r.strip() for r in recipients.split(',') if r.strip()]
    when = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    body_text = (
        f'На сайте «{company}» произошла ошибка у посетителя.\n\n'
        f'Время: {when}\n'
        f'Страница: {page_url or "—"}\n'
        f'Сообщение: {message}\n'
        f'Браузер: {user_agent or "—"}\n\n'
        f'Технические детали (stack):\n{stack or "—"}\n'
    )

    try:
        msg = MIMEText(body_text, 'plain', 'utf-8')
        msg['Subject'] = f'Ошибка на сайте {company}'
        msg['From'] = smtp_from
        msg['To'] = ', '.join(to_list)

        if int(port) == 465:
            server = smtplib.SMTP_SSL(host, int(port), timeout=15)
        else:
            server = smtplib.SMTP(host, int(port), timeout=15)
            server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_from, to_list, msg.as_string())
        server.quit()
        _ERROR_REPORT_LAST[key] = now_ts
        return _ok({'sent': True, 'recipients': len(to_list)})
    except Exception as ex:
        return _ok({'sent': False, 'error': str(ex)[:200]})


def _str_or_null(v, length=255):
    if v is None or v == '':
        return 'NULL'
    return f"'{_safe(str(v), length)}'"


def _int_or_null(v):
    if v is None or v == '':
        return 'NULL'
    try:
        return str(int(v))
    except Exception:
        return 'NULL'


def _bool(v):
    return 'TRUE' if v else 'FALSE'


def _jsonb_or_null(v):
    """Сериализует список/словарь в JSONB-совместимую SQL-строку."""
    if v is None:
        return 'NULL'
    try:
        s = json.dumps(v, ensure_ascii=False)
        return f"'{s.replace(chr(39), chr(39)+chr(39))}'::jsonb"
    except Exception:
        return 'NULL'


def _num_or_null(v):
    if v is None or v == '':
        return 'NULL'
    try:
        return str(float(v))
    except Exception:
        return 'NULL'


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.email, u.name, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_permissions(cur):
    """Загружает role_permissions из settings как dict {role: {section: {op: bool}}}"""
    try:
        cur.execute(f"SELECT role_permissions FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row and row['role_permissions']:
            val = row['role_permissions']
            # Поле может быть строкой или уже dict (зависит от драйвера)
            if isinstance(val, str):
                val = json.loads(val)
            # Двойной парсинг: если внутри снова строка (сохранено через JSON.stringify дважды)
            if isinstance(val, str):
                val = json.loads(val)
            if isinstance(val, dict):
                return val
    except Exception:
        pass
    return None


STAFF_ROLES = ('admin', 'director', 'manager', 'editor', 'broker', 'office_manager')

# Ресурсы доступные всем сотрудникам на чтение
STAFF_READ_RESOURCES = (
    'stats', 'listing_comments', 'listing_history', 'listing_stats',
    'listing_documents', 'ai_inpaint',
)

# Встроенные права по умолчанию (fallback если role_permissions не настроены в БД)
FALLBACK_PERMS = {
    'director': {
        'stats':            ['read'],
        'listings':         ['read', 'create', 'update', 'delete'],
        'leads':            ['read', 'create', 'update', 'delete'],
        'news':             ['read', 'create', 'update', 'delete'],
        'phones':           ['read', 'create', 'update', 'delete'],
        'pages':            ['read', 'create', 'update'],
        'settings':         ['read', 'update'],
        'users':            ['read', 'create', 'update'],
        'marketing':        ['read', 'update'],
        'vb-knowledge':     ['read'],
        'crm-kanban':       ['read', 'create', 'update', 'delete'],
        'crm-gamification': ['read'],
        'crm-checks':       ['read', 'create'],
        'crm-payments':     ['read', 'create', 'update'],
    },
    'manager': {
        'stats':            ['read'],
        'listings':         ['read', 'create', 'update', 'delete'],
        'leads':            ['read', 'create', 'update', 'delete'],
        'news':             ['read', 'create', 'update'],
        'phones':           ['read', 'create', 'update'],
        'marketing':        ['read'],
        'cities':           ['read'],
        'purposes':         ['read'],
        'xml_feeds':        ['read'],
        'land_vri':         ['read'],
        'crm-kanban':       ['read', 'create', 'update'],
        'crm-gamification': ['read'],
        'crm-checks':       ['read'],
        'crm-payments':     ['read'],
    },
    'editor': {
        'stats':            ['read'],
        'listings':         ['read', 'create', 'update'],
        'leads':            ['read'],
        'pages':            ['read', 'create', 'update'],
        'settings':         ['read', 'update'],
        'phones':           ['read', 'create', 'update'],
        'cities':           ['read', 'create', 'update'],
        'purposes':         ['read', 'create', 'update'],
        'xml_feeds':        ['read', 'create', 'update'],
        'land_vri':         ['read', 'create', 'update'],
    },
    'broker': {
        'stats':            ['read'],
        'listings':         ['read', 'create', 'update'],
        'leads':            ['read', 'create'],
        'phones':           ['read', 'create'],
        'cities':           ['read'],
        'purposes':         ['read'],
        'land_vri':         ['read'],
        'xml_feeds':        ['read'],
        'crm-kanban':       ['read', 'create', 'update'],
        'crm-gamification': ['read'],
        'crm-checks':       ['read'],
    },
    'office_manager': {
        'stats':            ['read'],
        'listings':         ['read'],
        'leads':            ['read', 'create', 'update'],
        'phones':           ['read', 'create', 'update'],
        'crm-kanban':       ['read', 'create', 'update'],
        'crm-payments':     ['read', 'create'],
    },
    'client': {
        'leads': ['create'],
    },
}


def _can(role, resource, op, permissions=None):
    if role == 'admin':
        return True
    # Сабресурсы доступны всем сотрудникам
    if resource in STAFF_READ_RESOURCES and role in STAFF_ROLES:
        return True
    # Проверка через кастомные права из БД
    if permissions and role in permissions:
        role_perms = permissions[role]
        if resource in role_perms:
            return bool(role_perms[resource].get(op, False))
        # Проверяем по группе (crm-kanban → crm)
        section_key = resource.split('-')[0] if '-' in resource else resource
        if section_key in role_perms:
            return bool(role_perms[section_key].get(op, False))
        return False
    # Fallback — встроенные права
    fallback = FALLBACK_PERMS.get(role, {})
    allowed_ops = fallback.get(resource, [])
    if not allowed_ops:
        # Проверяем по группе (crm-kanban → crm)
        section_key = resource.split('-')[0] if '-' in resource else resource
        allowed_ops = fallback.get(section_key, [])
    return op in allowed_ops


def handler(event, context):
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    resource = params.get('resource', '')
    rid = params.get('id')
    action = params.get('action')
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Публичный ресурс: приём ошибок с фронтенда (без авторизации).
            # Шлёт письмо админам, если настроен SMTP. Не должен ломать фронт.
            if resource == 'error_report' and method == 'POST':
                return _error_report(cur, event)

            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')

            permissions = _load_permissions(cur)
            op = {'GET': 'read', 'POST': 'create', 'PUT': 'update', 'DELETE': 'delete'}.get(method, 'read')
            if not _can(user['role'], resource, op, permissions):
                return _err(403, 'Недостаточно прав')

            if resource == 'listings':
                return _listings(cur, conn, method, rid, event, user)
            if resource == 'leads':
                return _leads(cur, conn, method, rid, action, event, user)
            if resource == 'users':
                return _users(cur, conn, method, rid, event, user)
            if resource == 'pages':
                return _pages(cur, conn, method, rid, event, user)
            if resource == 'settings':
                return _settings(cur, conn, method, event, user)
            if resource == 'cities':
                return _cities(cur, conn, method, rid, event, user)
            if resource == 'purposes':
                return _purposes(cur, conn, method, rid, event, user)
            if resource == 'land_vri':
                return _land_vri(cur, conn, method, rid, event, user)
            if resource == 'districts':
                return _districts(cur, conn, method, rid, event, user)
            if resource == 'xml_feeds':
                return _xml_feeds(cur, conn, method, rid, event, user)
            if resource == 'stats':
                return _stats(cur)
            if resource == 'listing_history':
                return _listing_history(cur, method, rid, event, user)
            if resource == 'listing_stats':
                return _listing_stats(cur, rid)
            if resource == 'listings_bulk':
                return _listings_bulk(cur, conn, event, user)
            if resource == 'phones':
                return _phones(cur, conn, method, rid, action, event, user)
            if resource == 'role_permissions':
                return _role_permissions(cur, conn, method, event, user, permissions)
            if resource == 'listing_documents':
                return _listing_documents(cur, conn, method, rid, action, event, user)
            if resource == 'listing_comments':
                return _listing_comments(cur, conn, method, rid, event, user)
            if resource == 'ad_platform_keys':
                return _ad_platform_keys(cur, conn, method, rid, event, user)
            if resource == 'notifications':
                return _notifications(cur, conn, method, action, event, user)
            if resource == 'webmaster_check':
                return _webmaster_check(cur, method, action, event, user)
            if resource == 'ai_inpaint':
                return _ai_inpaint(cur, event, user)
            if resource == 'consent_log':
                return _consent_log(cur, conn, method, event, user)
            if resource == 'ai_memory':
                return _ai_memory(cur, conn, method, rid, event, user)
            if resource == 'vb_retrain_schedule':
                return _vb_retrain_schedule(cur, conn, method, event, user)
            if resource == 'vb_stop_words':
                return _vb_stop_words(cur, conn, method, rid, event, user)
            if resource == 'vb_learn_sources':
                return _vb_learn_sources(cur, conn, method, rid, event, user)
            if resource == 'site_health':
                return _site_health(cur, conn, method, action, event, user)

            return _err(400, 'Неизвестный ресурс')
    finally:
        conn.close()


def _ai_memory(cur, conn, method, rid, event, user):
    """CRUD базы знаний Виртуального брокера (ai_memory: key/value)."""
    if user['role'] not in ('admin', 'director', 'editor'):
        return _err(403, 'Доступ только для admin/director/editor')

    if method == 'GET':
        # Подсчёт использованного объёма (сумма длин value в байтах)
        total_bytes = 0
        items_count = 0
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c, COALESCE(SUM(LENGTH(value)), 0) AS total "
                f"FROM {SCHEMA}.ai_memory"
            )
            r = cur.fetchone() or {}
            items_count = int(r.get('c') or 0)
            total_bytes = int(r.get('total') or 0)
        except Exception:
            pass

        # Лимит — 500 МБ
        limit_bytes = 500 * 1024 * 1024
        usage_percent = round((total_bytes / limit_bytes) * 100, 2) if limit_bytes else 0

        cur.execute(
            f"SELECT id, key, value, updated_at FROM {SCHEMA}.ai_memory "
            f"ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 500"
        )
        items = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get('updated_at'):
                try:
                    d['updated_at'] = d['updated_at'].isoformat()
                except Exception:
                    d['updated_at'] = str(d['updated_at'])
            items.append(d)
        return _ok({
            'items': items,
            'usage': {
                'total_bytes': total_bytes,
                'limit_bytes': limit_bytes,
                'usage_percent': usage_percent,
                'items_count': items_count,
            },
        })

    body = json.loads(event.get('body') or '{}')
    action = (event.get('queryStringParameters') or {}).get('action') or body.get('action')

    # Спец-действие: «Переобучить ВБ» — ИИ преобразует разные источники в факты
    # Поддерживаемые источники (sources):
    #   news      — новости рынка
    #   listings  — описания объектов каталога
    #   invest    — инвест-модель (средние цены, окупаемость)
    #   demand    — заявки и поисковые запросы клиентов
    #   terms     — популярные термины из описаний объектов
    if method == 'POST' and (action == 'from_news' or action == 'retrain'):
        if user['role'] not in ('admin', 'director'):
            return _err(403, 'Только admin и director могут переобучать ВБ')

        # Список источников. Для обратной совместимости: from_news = только news.
        sources = body.get('sources')
        if action == 'from_news':
            sources = ['news']
        if not isinstance(sources, list) or not sources:
            sources = ['news']

        # Достаём ключ YandexGPT
        try:
            cur.execute(
                f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
            )
            row = cur.fetchone() or {}
            api_key = row.get('yandex_api_key') or os.environ.get('YANDEX_API_KEY', '')
            folder_id = row.get('yandex_folder_id') or os.environ.get('YANDEX_FOLDER_ID', '')
        except Exception:
            api_key = os.environ.get('YANDEX_API_KEY', '')
            folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
        if not api_key or not folder_id:
            return _err(503, 'YandexGPT не настроен. Добавьте ключи в Настройки → Интеграции.')

        import urllib.request

        def _call_gpt(system_prompt: str, user_text: str) -> str:
            payload = {
                'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
                'completionOptions': {'stream': False, 'temperature': 0.6, 'maxTokens': 8000},
                'messages': [
                    {'role': 'system', 'text': system_prompt},
                    {'role': 'user', 'text': user_text},
                ],
            }
            req_obj = urllib.request.Request(
                'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Authorization': f'Api-Key {api_key}',
                    'Content-Type': 'application/json',
                    'x-folder-id': folder_id,
                },
                method='POST',
            )
            with urllib.request.urlopen(req_obj, timeout=60) as resp:
                gpt_data = json.loads(resp.read().decode('utf-8'))
            alts = (gpt_data.get('result') or {}).get('alternatives') or []
            return ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''

        def _parse_facts(raw_text: str) -> list:
            cleaned = raw_text.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.strip('`')
                if cleaned.lower().startswith('json'):
                    cleaned = cleaned[4:].strip()
            s = cleaned.find('[')
            e = cleaned.rfind(']')
            if s >= 0 and e > s:
                cleaned = cleaned[s:e + 1]
            try:
                result = json.loads(cleaned)
                return result if isinstance(result, list) else []
            except Exception:
                return []

        def _save_facts(facts: list, prefix: str) -> int:
            count = 0
            for f in facts[:100]:
                if not isinstance(f, dict):
                    continue
                k = _safe(str(f.get('key') or '').strip(), 100)
                v = _safe(str(f.get('value') or '').strip(), 5000)
                if not k or not v:
                    continue
                if not k.startswith(prefix):
                    k = (prefix + k)[:100]
                try:
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.ai_memory (key, value, updated_at) "
                        f"VALUES ('{k}', '{v}', NOW()) "
                        f"ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
                    )
                    count += 1
                except Exception:
                    continue
            return count

        # Описания форматов источников
        source_configs = {
            'news': {
                'prefix': 'news_',
                'system': (
                    'Ты — помощник ВБ. На входе — новости рынка коммерческой недвижимости. '
                    'Извлеки 5-15 коротких фактов для базы знаний.\n'
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "news_slug", "value": "1-3 предложения"}, ...]\n'
                    'key начинается с news_, латиница нижний регистр через _.'
                ),
            },
            'listings': {
                'prefix': 'listing_',
                'system': (
                    'Ты — помощник ВБ. На входе — описания объектов каталога коммерческой '
                    'недвижимости. Извлеки 5-10 типовых закономерностей: характерные сильные '
                    'стороны объектов, популярные локации, отличительные черты.\n'
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "listing_slug", "value": "1-3 предложения"}, ...]\n'
                    'key начинается с listing_, латиница нижний регистр через _.'
                ),
            },
            'invest': {
                'prefix': 'invest_',
                'system': (
                    'Ты — помощник ВБ. На входе — данные о ценах, окупаемости, доходности '
                    'объектов. Извлеки 5-10 инвест-фактов для клиентов: средние ставки cap-rate, '
                    'типичные сроки окупаемости, диапазоны цен по категориям.\n'
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "invest_slug", "value": "1-3 предложения с цифрами"}, ...]\n'
                    'key начинается с invest_.'
                ),
            },
            'demand': {
                'prefix': 'demand_',
                'system': (
                    'Ты — помощник ВБ. На входе — заявки и поисковые запросы клиентов. '
                    'Извлеки 5-10 фактов о спросе: какие категории чаще ищут, типичные бюджеты, '
                    'популярные локации, частые задачи (под кофейню/под склад и т.д.).\n'
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "demand_slug", "value": "1-3 предложения"}, ...]\n'
                    'key начинается с demand_.'
                ),
            },
            'terms': {
                'prefix': 'term_',
                'system': (
                    'Ты — помощник ВБ. На входе — текстовые описания объектов. '
                    'Найди 5-10 ключевых терминов/фраз, которые часто встречаются, '
                    'и объясни каждый коротко.\n'
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "term_slug", "value": "Термин — объяснение"}, ...]\n'
                    'key начинается с term_.'
                ),
            },
            'market_history': {
                'prefix': 'market_hist_',
                'system': (
                    'Ты — аналитик рынка коммерческой недвижимости Краснодара. '
                    'На входе — исторические данные цен по годам, районам и категориям, а также макроэкономические показатели (ставка ЦБ, инвестиции). '
                    'Извлеки 10-20 аналитических фактов: динамику цен по годам, сравнение районов, инвестиционные выводы, тренды. '
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "market_hist_slug", "value": "факт с цифрами и годами"}, ...]\n'
                    'key начинается с market_hist_, латиница нижний регистр через _.'
                ),
            },
            'biweekly_history': {
                'prefix': 'biweekly_',
                'system': (
                    'Ты — аналитик рынка коммерческой недвижимости Краснодара. '
                    'На входе — двухнедельные срезы цен продажи и аренды по категориям с 2019 по 2026 год. '
                    'Извлеки 10-20 конкретных фактов: пиковые значения, минимумы, динамику роста, '
                    'сравнение категорий, долгосрочные тренды, аномальные скачки. '
                    'Формат: JSON-массив без markdown: '
                    '[{"key": "biweekly_slug", "value": "факт с цифрами, датами и % изменением"}, ...]\n'
                    'key начинается с biweekly_, латиница нижний регистр через _.'
                ),
            },
        }

        total_saved = 0
        per_source: list = []

        for src in sources:
            if src not in source_configs:
                continue
            cfg = source_configs[src]
            user_text = ''
            count_input = 0

            try:
                if src == 'news':
                    cur.execute(
                        f"SELECT id, title, summary, content FROM {SCHEMA}.news "
                        f"WHERE is_published = TRUE "
                        f"ORDER BY COALESCE(published_at, created_at) DESC LIMIT 15"
                    )
                    rows = cur.fetchall() or []
                    count_input = len(rows)
                    parts = []
                    for n in rows:
                        t = (n.get('title') or '').strip()
                        s = (n.get('summary') or '').strip()[:300]
                        c = (n.get('content') or '').strip()[:600]
                        block = f"«{t}»"
                        if s: block += f"\nКраткое: {s}"
                        if c: block += f"\nПодробно: {c}"
                        parts.append(block)
                    user_text = '\n\n---\n\n'.join(parts)[:8000]

                elif src == 'listings':
                    cur.execute(
                        f"SELECT title, category, deal, description, district, price, area, tags "
                        f"FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(COALESCE(description,''))>50 "
                        f"ORDER BY updated_at DESC NULLS LAST LIMIT 30"
                    )
                    rows = cur.fetchall() or []
                    count_input = len(rows)
                    parts = []
                    for n in rows:
                        t = (n.get('title') or '')[:120]
                        d = (n.get('description') or '')[:500]
                        meta = f"{n.get('category', '')}/{n.get('deal', '')} · {n.get('district', '')} · {n.get('area', '')} м² · {n.get('price', '')} ₽"
                        parts.append(f"«{t}» ({meta})\n{d}")
                    user_text = '\n\n---\n\n'.join(parts)[:9000]

                elif src == 'invest':
                    # Программная генерация — числовые агрегаты
                    cur.execute(
                        f"SELECT category, deal, COUNT(*) AS cnt, "
                        f"ROUND(AVG(price)::numeric,0) AS avg_price, ROUND(MIN(price)::numeric,0) AS min_price, ROUND(MAX(price)::numeric,0) AS max_price, "
                        f"ROUND(AVG(price_per_m2)::numeric,0) AS avg_p2, ROUND(AVG(area)::numeric,1) AS avg_area, "
                        f"ROUND(AVG(payback)::numeric,1) AS avg_payback, ROUND(AVG(monthly_rent)::numeric,0) AS avg_rent "
                        f"FROM {SCHEMA}.listings WHERE status='active' "
                        f"GROUP BY category, deal HAVING COUNT(*) > 0 ORDER BY cnt DESC"
                    )
                    rows = cur.fetchall() or []
                    count_input = len(rows)
                    _cat_ru = {'retail':'Торговая','office':'Офисная','warehouse':'Складская','industrial':'Производственная','catering':'Общепит','free_purpose':'ПСН','standalone':'Отдельно стоящие здания'}
                    _deal_ru = {'sale':'продажа','rent':'аренда'}
                    _facts_inv = []
                    for r in rows:
                        cat = _cat_ru.get(r.get('category') or '', r.get('category') or '')
                        dl = _deal_ru.get(r.get('deal') or '', r.get('deal') or '')
                        slug = f"{r.get('category')}_{r.get('deal')}"
                        cnt = int(r.get('cnt') or 0)
                        avg_p = int(r.get('avg_price') or 0)
                        min_p = int(r.get('min_price') or 0)
                        max_p = int(r.get('max_price') or 0)
                        p2 = int(r.get('avg_p2') or 0)
                        area = float(r.get('avg_area') or 0)
                        payback = float(r.get('avg_payback') or 0)
                        rent = int(r.get('avg_rent') or 0)
                        _facts_inv.append({'key': f'invest_{slug}_count', 'value': f'{cat} ({dl}): {cnt} активных объектов в каталоге'})
                        if avg_p: _facts_inv.append({'key': f'invest_{slug}_price', 'value': f'{cat} ({dl}): средняя цена {avg_p:,} ₽, диапазон {min_p:,}–{max_p:,} ₽'})
                        if p2: _facts_inv.append({'key': f'invest_{slug}_price_m2', 'value': f'{cat} ({dl}): средняя цена за м² — {p2:,} руб/м²'})
                        if area: _facts_inv.append({'key': f'invest_{slug}_area', 'value': f'{cat} ({dl}): средняя площадь — {area} м²'})
                        if payback and r.get('deal') == 'sale': _facts_inv.append({'key': f'invest_{slug}_payback', 'value': f'{cat} (продажа): средний срок окупаемости — {payback:.0f} мес'})
                        if rent and r.get('deal') == 'sale': _facts_inv.append({'key': f'invest_{slug}_rent', 'value': f'{cat} (продажа): потенциальная арендная ставка — {rent:,} ₽/мес'})
                    saved_count = _save_facts(_facts_inv, cfg['prefix'])
                    per_source.append({'source': src, 'saved': saved_count, 'input_count': count_input})
                    total_saved += saved_count
                    continue

                elif src == 'demand':
                    # Программная генерация — агрегаты по лидам
                    cur.execute(
                        f"SELECT request_category, lead_type, COUNT(*) AS cnt, "
                        f"ROUND(AVG(budget)::numeric,0) AS avg_budget, ROUND(MIN(budget)::numeric,0) AS min_budget, ROUND(MAX(budget)::numeric,0) AS max_budget "
                        f"FROM {SCHEMA}.leads WHERE created_at > NOW() - INTERVAL '90 days' "
                        f"GROUP BY request_category, lead_type HAVING COUNT(*) > 0 ORDER BY cnt DESC LIMIT 30"
                    )
                    rows = cur.fetchall() or []
                    cur.execute(f"SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30d, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d FROM {SCHEMA}.leads")
                    st = cur.fetchone() or {}
                    count_input = len(rows)
                    _facts_dem = []
                    total_l = int(st.get('total') or 0)
                    last_30 = int(st.get('last_30d') or 0)
                    last_7 = int(st.get('last_7d') or 0)
                    if total_l: _facts_dem.append({'key': 'demand_total_leads', 'value': f'Всего заявок: {total_l}, за 30 дней: {last_30}, за 7 дней: {last_7}'})
                    for r in rows:
                        cat = r.get('request_category') or 'не указана'
                        lt = r.get('lead_type') or 'не указан'
                        cnt = int(r.get('cnt') or 0)
                        avg_b = int(r.get('avg_budget') or 0)
                        min_b = int(r.get('min_budget') or 0)
                        max_b = int(r.get('max_budget') or 0)
                        slug = f"{(r.get('request_category') or 'other').lower().replace(' ','_')[:20]}_{(r.get('lead_type') or 'other').lower()[:10]}"
                        _facts_dem.append({'key': f'demand_{slug}_count', 'value': f'Спрос «{cat}» ({lt}): {cnt} заявок за 90 дней'})
                        if avg_b: _facts_dem.append({'key': f'demand_{slug}_budget', 'value': f'Бюджет «{cat}» ({lt}): средний {avg_b:,} ₽, диапазон {min_b:,}–{max_b:,} ₽'})
                    saved_count = _save_facts(_facts_dem, cfg['prefix'])
                    per_source.append({'source': src, 'saved': saved_count, 'input_count': count_input})
                    total_saved += saved_count
                    continue

                elif src == 'terms':
                    cur.execute(
                        f"SELECT description FROM {SCHEMA}.listings "
                        f"WHERE status='active' AND LENGTH(COALESCE(description,'')) > 100 "
                        f"ORDER BY updated_at DESC NULLS LAST LIMIT 40"
                    )
                    rows = cur.fetchall() or []
                    count_input = len(rows)
                    parts = [(r.get('description') or '')[:600] for r in rows]
                    user_text = '\n\n---\n\n'.join(parts)[:9000]

                elif src == 'market_history':
                    # Программная генерация — числовые данные price_history + macro
                    cur.execute(f"SELECT year, district_name, category, deal_type, avg_price_per_m2, avg_rent_per_m2_year, avg_cap_rate, vacancy_rate, notes FROM {SCHEMA}.price_history ORDER BY year, district_name, category")
                    ph_rows = cur.fetchall() or []
                    cur.execute(f"SELECT date_recorded, key_rate, inflation_rate, investment_volume_rf, notes FROM {SCHEMA}.macro_indicators ORDER BY date_recorded")
                    macro_rows = cur.fetchall() or []
                    count_input = len(ph_rows) + len(macro_rows)
                    _cat_ru = {'retail':'Торговая','office':'Офисная','warehouse':'Складская','industrial':'Производственная','catering':'Общепит','free_purpose':'ПСН','standalone':'Отдельно стоящие здания'}
                    _facts_mh = []
                    for r in macro_rows:
                        yr = str(r.get('date_recorded') or '')[:4]
                        p = []
                        if r.get('key_rate'): p.append(f"ставка ЦБ {r['key_rate']}%")
                        if r.get('inflation_rate'): p.append(f"инфляция {r['inflation_rate']}%")
                        if r.get('investment_volume_rf'): p.append(f"инвестиции {r['investment_volume_rf']} млрд руб")
                        if r.get('notes'): p.append((r['notes'] or '')[:200])
                        if p: _facts_mh.append({'key': f'market_hist_macro_{yr}', 'value': f'Макроэкономика {yr}: ' + ', '.join(p)})
                    for r in ph_rows:
                        yr = r.get('year')
                        dn = r.get('district_name') or 'Краснодар'
                        cat = _cat_ru.get(r.get('category') or '', r.get('category') or '')
                        dt = 'продажа' if r.get('deal_type') == 'sale' else 'аренда'
                        slug = f"{yr}_{(r.get('district_name') or 'krd').lower().replace(' ','_')[:15]}_{r.get('category')}_{r.get('deal_type')}"
                        p = []
                        if r.get('avg_price_per_m2'): p.append(f"цена {int(r['avg_price_per_m2']):,} руб/м²")
                        if r.get('avg_rent_per_m2_year'): p.append(f"аренда {int(r['avg_rent_per_m2_year']):,} руб/м²/год")
                        if r.get('avg_cap_rate'): p.append(f"cap rate {r['avg_cap_rate']}%")
                        if r.get('vacancy_rate'): p.append(f"вакансия {r['vacancy_rate']}%")
                        if r.get('notes'): p.append((r['notes'] or '')[:150])
                        if p: _facts_mh.append({'key': f'market_hist_{slug}', 'value': f'{yr} | {dn} | {cat} ({dt}): ' + ', '.join(p)})
                    saved_count = _save_facts(_facts_mh, cfg['prefix'])
                    per_source.append({'source': src, 'saved': saved_count, 'input_count': count_input})
                    total_saved += saved_count
                    continue

                elif src == 'biweekly_history':
                    # Генерируем факты программно — без GPT, мгновенно
                    cur.execute(
                        f"SELECT EXTRACT(YEAR FROM date_recorded)::int AS yr, category, deal_type, "
                        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_price "
                        f"FROM {SCHEMA}.price_history_biweekly "
                        f"GROUP BY yr, category, deal_type ORDER BY category, deal_type, yr"
                    )
                    yearly_rows = cur.fetchall() or []
                    count_input = len(yearly_rows)
                    _cat_ru = {
                        'retail': 'Торговая недвижимость', 'office': 'Офисная недвижимость',
                        'warehouse': 'Складская недвижимость', 'industrial': 'Производственные помещения',
                        'catering': 'Помещения общепита', 'free_purpose': 'ПСН',
                        'standalone': 'Отдельно стоящие здания',
                    }
                    from collections import defaultdict as _dd
                    _data = _dd(dict)
                    for r in yearly_rows:
                        _data[(r['category'], r['deal_type'])][int(r['yr'])] = int(r['avg_price'] or 0)
                    all_biweekly_facts = []
                    for (cat, dt), yearly in _data.items():
                        cl = _cat_ru.get(cat, cat)
                        dl = 'продажа' if dt == 'sale' else 'аренда/мес'
                        yrs = sorted(yearly.keys())
                        if not yrs:
                            continue
                        p0, p1 = yearly[yrs[0]], yearly[yrs[-1]]
                        if p0 > 0:
                            pct = round((p1 - p0) / p0 * 100)
                            s = '+' if pct >= 0 else ''
                            all_biweekly_facts.append({'key': f'biweekly_{cat}_{dt}_trend', 'value': f'{cl} ({dl}): с {p0:,} руб/м² в {yrs[0]} до {p1:,} руб/м² в {yrs[-1]} ({s}{pct}% за {yrs[-1]-yrs[0]} лет)'})
                        for yr in yrs:
                            all_biweekly_facts.append({'key': f'biweekly_{cat}_{dt}_{yr}', 'value': f'{cl} ({dl}) {yr} год: средняя цена {yearly[yr]:,} руб/м²'})
                        my = max(yearly, key=yearly.get)
                        mny = min(yearly, key=yearly.get)
                        all_biweekly_facts.append({'key': f'biweekly_{cat}_{dt}_peak', 'value': f'{cl} ({dl}): пик цены в {my} году — {yearly[my]:,} руб/м²'})
                        if mny != my:
                            all_biweekly_facts.append({'key': f'biweekly_{cat}_{dt}_min', 'value': f'{cl} ({dl}): минимум цены в {mny} году — {yearly[mny]:,} руб/м²'})
                        for i in range(1, len(yrs)):
                            yp, yc = yrs[i-1], yrs[i]
                            pp, pc = yearly[yp], yearly[yc]
                            if pp > 0:
                                chg = round((pc - pp) / pp * 100)
                                if abs(chg) >= 15:
                                    d = 'вырос' if chg > 0 else 'упал'
                                    all_biweekly_facts.append({'key': f'biweekly_{cat}_{dt}_{yp}_{yc}_yoy', 'value': f'{cl} ({dl}): цена {d} на {abs(chg)}% с {yp} по {yc} год ({pp:,} → {pc:,} руб/м²)'})
                    saved_count = _save_facts(all_biweekly_facts, cfg['prefix'])
                    per_source.append({'source': src, 'saved': saved_count, 'input_count': count_input})
                    total_saved += saved_count
                    continue

                if not user_text.strip() or count_input == 0:
                    per_source.append({'source': src, 'saved': 0, 'input_count': 0, 'skipped': 'нет данных'})
                    continue

                print(f'[retrain:{src}] text_len={len(user_text)} count_input={count_input}')
                raw = _call_gpt(cfg['system'], user_text)
                print(f'[retrain:{src}] raw_len={len(raw)} raw_preview={repr(raw[:600])}')
                facts = _parse_facts(raw)
                print(f'[retrain:{src}] facts_parsed={len(facts)}')
                saved_count = _save_facts(facts, cfg['prefix'])
                print(f'[retrain:{src}] saved={saved_count}')
                per_source.append({'source': src, 'saved': saved_count, 'input_count': count_input})
                total_saved += saved_count

            except Exception as e:
                per_source.append({'source': src, 'saved': 0, 'error': str(e)[:200]})
                continue

        conn.commit()
        return _ok({
            'success': True,
            'saved': total_saved,
            'per_source': per_source,
            # Поля для обратной совместимости
            'news_count': next((p.get('input_count', 0) for p in per_source if p.get('source') == 'news'), 0),
        })

    if method == 'POST':
        key = _safe(body.get('key') or '', 100)
        value = _safe(body.get('value') or '', 5000)
        if not key or not value:
            return _err(400, 'Нужны key и value')
        # UPSERT по key
        cur.execute(
            f"INSERT INTO {SCHEMA}.ai_memory (key, value, updated_at) "
            f"VALUES ('{key}', '{value}', NOW()) "
            f"ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW() "
            f"RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'PUT' and rid:
        if 'value' not in body and 'key' not in body:
            return _err(400, 'Нет полей')
        fields = []
        if 'key' in body:
            fields.append(f"key = {_str_or_null(body.get('key'), 100)}")
        if 'value' in body:
            fields.append(f"value = {_str_or_null(body.get('value'), 5000)}")
        fields.append('updated_at = NOW()')
        cur.execute(
            f"UPDATE {SCHEMA}.ai_memory SET {', '.join(fields)} WHERE id = {int(rid)}"
        )
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.ai_memory WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(405, 'Метод не поддерживается')


def _vb_retrain_schedule(cur, conn, method, event, user):
    """GET/PUT расписания автопереобучения ВБ."""
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Доступ только для admin/director')

    if method == 'GET':
        cur.execute(
            f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, "
            f"vb_retrain_sources, vb_retrain_last_at, vb_retrain_last_status, vb_retrain_last_saved "
            f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        row = cur.fetchone() or {}
        sources = row.get('vb_retrain_sources') or []
        if isinstance(sources, str):
            try:
                import json as _j
                sources = _j.loads(sources)
            except Exception:
                sources = []
        return _ok({
            'enabled': bool(row.get('vb_retrain_enabled')),
            'hour': int(row.get('vb_retrain_hour') or 3),
            'minute': int(row.get('vb_retrain_minute') or 0),
            'sources': sources if isinstance(sources, list) else [],
            'last_at': row['vb_retrain_last_at'].isoformat() if row.get('vb_retrain_last_at') else None,
            'last_status': row.get('vb_retrain_last_status'),
            'last_saved': row.get('vb_retrain_last_saved'),
        })

    if method == 'PUT':
        import json as _j
        body = _j.loads(event.get('body') or '{}')
        enabled = 'TRUE' if body.get('enabled') else 'FALSE'
        hour = max(0, min(23, int(body.get('hour') or 3)))
        minute = max(0, min(59, int(body.get('minute') or 0)))
        sources = body.get('sources') or []
        sources_json = _safe(_j.dumps(sources, ensure_ascii=False), 2000)
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET "
            f"vb_retrain_enabled = {enabled}, "
            f"vb_retrain_hour = {hour}, "
            f"vb_retrain_minute = {minute}, "
            f"vb_retrain_sources = '{sources_json}' "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
        )
        conn.commit()
        return _ok({'success': True})

    return _err(405, 'Метод не поддерживается')


def _vb_stop_words(cur, conn, method, rid, event, user):
    """CRUD стоп-слов ВБ."""
    import json as _j
    if user['role'] not in ('admin', 'director', 'editor'):
        return _err(403, 'Доступ только для admin/director/editor')

    if method == 'GET':
        cur.execute(f"SELECT id, word, created_at FROM {SCHEMA}.vb_stop_words ORDER BY id ASC")
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get('created_at'):
                d['created_at'] = d['created_at'].isoformat()
            rows.append(d)
        return _ok({'items': rows})

    body = _j.loads(event.get('body') or '{}')

    if method == 'POST':
        word = _safe((body.get('word') or '').strip(), 200)
        if not word:
            return _err(400, 'Слово обязательно')
        cur.execute(f"INSERT INTO {SCHEMA}.vb_stop_words (word) VALUES ('{word}') ON CONFLICT DO NOTHING RETURNING id")
        row = cur.fetchone()
        conn.commit()
        return _ok({'success': True, 'id': row['id'] if row else None})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.vb_stop_words WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(405, 'Метод не поддерживается')


def _vb_learn_sources(cur, conn, method, rid, event, user):
    """CRUD источников для самообучения ВБ (URL сайтов)."""
    import json as _j
    if user['role'] not in ('admin', 'director', 'editor'):
        return _err(403, 'Доступ только для admin/director/editor')

    if method == 'GET':
        cur.execute(f"SELECT id, title, url, is_active, last_fetched_at, created_at FROM {SCHEMA}.vb_learn_sources ORDER BY id ASC")
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            for f in ('last_fetched_at', 'created_at'):
                if d.get(f):
                    d[f] = d[f].isoformat()
            rows.append(d)
        return _ok({'items': rows})

    body = _j.loads(event.get('body') or '{}')

    if method == 'POST':
        title = _safe((body.get('title') or '').strip(), 200)
        url = _safe((body.get('url') or '').strip(), 500)
        if not title or not url:
            return _err(400, 'Нужны title и url')
        cur.execute(
            f"INSERT INTO {SCHEMA}.vb_learn_sources (title, url) VALUES ('{title}', '{url}') RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'success': True, 'id': new_id})

    if method == 'PUT' and rid:
        fields = []
        if 'title' in body:
            fields.append(f"title = '{_safe((body['title'] or ''), 200)}'")
        if 'url' in body:
            fields.append(f"url = '{_safe((body['url'] or ''), 500)}'")
        if 'is_active' in body:
            fields.append(f"is_active = {'TRUE' if body['is_active'] else 'FALSE'}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.vb_learn_sources SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.vb_learn_sources WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(405, 'Метод не поддерживается')


def _site_health(cur, conn, method, action, event, user):
    """Диагностика и обслуживание сайта.
    GET ?resource=site_health&action=check         — полная проверка здоровья
    GET ?resource=site_health&action=scan_security — антивирус/безопасность
    GET ?resource=site_health&action=scan_photos   — битые фото (выборка 50 объявлений)
    GET ?resource=site_health&action=s3_stats      — статистика S3 хранилища
    GET ?resource=site_health&action=xml_check     — проверка XML-фидов
    POST ?resource=site_health&action=clear_ai_logs
    POST ?resource=site_health&action=clear_old_sessions
    POST ?resource=site_health&action=clear_orphan_leads
    POST ?resource=site_health&action=vacuum_stats
    POST ?resource=site_health&action=fix_slugs
    POST ?resource=site_health&action=fix_broken_photos — обнулить битые фото
    """
    import urllib.request as _ur
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Только admin/director')

    # ── ПОЛНАЯ ПРОВЕРКА ──────────────────────────────────────────────────────
    if action == 'check' or (method == 'GET' and not action):
        checks = []

        def _chk(name, ok, detail='', fix_action=None, view_action=None):
            checks.append({'name': name, 'ok': ok, 'detail': detail,
                           'fix_action': fix_action, 'view_action': view_action})

        # 1. БД — таблицы
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings")
            n = cur.fetchone()['c']
            _chk('База данных', True, f'{n} объявлений')
        except Exception as e:
            _chk('База данных', False, str(e)[:120])

        # 2. Активные объявления без описания
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings "
                f"WHERE status='active' AND COALESCE(LENGTH(description),0) < 30"
            )
            n = cur.fetchone()['c']
            _chk('Объявления с описанием', n == 0,
                 f'{n} активных без описания' if n else 'Все заполнены',
                 fix_action='ai_fix_descriptions' if n else None,
                 view_action='view_listings_no_desc' if n else None)
        except Exception as e:
            _chk('Объявления с описанием', False, str(e)[:80])

        # 3. Объявления без цены
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings "
                f"WHERE status='active' AND (price IS NULL OR price = 0)"
            )
            n = cur.fetchone()['c']
            _chk('Цены объявлений', n == 0,
                 f'{n} без цены' if n else 'Всё заполнено',
                 view_action='view_listings_no_price' if n else None)
        except Exception as e:
            _chk('Цены объявлений', False, str(e)[:80])

        # 4. Висящие лиды (без телефона > 7 дней)
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads "
                f"WHERE (phone IS NULL OR phone='') AND created_at < NOW() - INTERVAL '7 days'"
            )
            n = cur.fetchone()['c']
            _chk('Лиды без телефона', n == 0,
                 f'{n} старых без телефона' if n else 'Чисто',
                 fix_action='clear_orphan_leads' if n else None,
                 view_action='view_orphan_leads' if n else None)
        except Exception as e:
            _chk('Лиды без телефона', False, str(e)[:80])

        # 5. Сессии — просроченные
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.sessions WHERE expires_at < NOW()"
            )
            n = cur.fetchone()['c']
            _chk('Истёкшие сессии', n < 500,
                 f'{n} истёкших сессий',
                 fix_action='clear_old_sessions' if n >= 500 else None)
        except Exception as e:
            _chk('Истёкшие сессии', False, str(e)[:80])

        # 6. Логи ИИ — размер
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.ai_logs")
            n = cur.fetchone()['c']
            _chk('Логи ИИ', n < 5000,
                 f'{n} записей{"  — рекомендуем очистку" if n >= 5000 else ""}',
                 fix_action='clear_ai_logs' if n >= 5000 else None)
        except Exception as e:
            _chk('Логи ИИ', True, 'таблица не найдена')

        # 7. База знаний ВБ
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.ai_memory")
            n = cur.fetchone()['c']
            _chk('База знаний ВБ', True, f'{n} фактов')
        except Exception as e:
            _chk('База знаний ВБ', False, str(e)[:80])

        # 8. Дубли объявлений (одинаковый заголовок + цена + активные)
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM ("
                f"  SELECT title, price FROM {SCHEMA}.listings "
                f"  WHERE status='active' AND title IS NOT NULL AND title != '' "
                f"  GROUP BY title, price HAVING COUNT(*) > 1"
                f") AS dups"
            )
            n = cur.fetchone()['c']
            _chk('Дубли объявлений', n == 0,
                 f'{n} групп дублей' if n else 'Дублей нет',
                 fix_action='fix_duplicates' if n else None,
                 view_action='view_duplicates' if n else None)
        except Exception as e:
            _chk('Дубли объявлений', False, str(e)[:80])

        # 9. XSS-уязвимости в текстах
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings "
                f"WHERE LOWER(COALESCE(description,'')) LIKE '%<script%' "
                f"OR LOWER(COALESCE(title,'')) LIKE '%<script%' "
                f"OR LOWER(COALESCE(description,'')) LIKE '%javascript:%'"
            )
            n = cur.fetchone()['c']
            _chk('XSS-уязвимости', n == 0,
                 f'{n} объектов с подозрительным кодом' if n else 'Чисто',
                 view_action='view_xss' if n else None)
        except Exception as e:
            _chk('XSS-уязвимости', False, str(e)[:80])

        # 10. Настройки сайта заполнены
        try:
            cur.execute(
                f"SELECT id, company_name, company_phone, seo_description "
                f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
            )
            row = cur.fetchone()
            if row is None:
                _chk('Настройки сайта', False, 'Строка настроек не найдена — требуется инициализация',
                     fix_action='ai_fix_settings')
            else:
                SETTINGS_LABELS = {
                    'company_name': 'название компании',
                    'company_phone': 'телефон',
                    'seo_description': 'SEO-описание сайта',
                }
                missing = [k for k in ('company_name', 'company_phone', 'seo_description') if not row.get(k)]
                _chk('Настройки сайта', len(missing) == 0,
                     f'Не заполнено: {", ".join(SETTINGS_LABELS.get(m, m) for m in missing)}' if missing else 'Все заполнены',
                     fix_action='ai_fix_settings' if missing else None,
                     view_action='view_settings' if missing else None)
        except Exception as e:
            _chk('Настройки сайта', False, str(e)[:80])

        # 11. SEO — объявления без мета
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings "
                f"WHERE status='active' AND (seo_title IS NULL OR seo_title='')"
            )
            n = cur.fetchone()['c']
            _chk('SEO объявлений', n == 0,
                 f'{n} без seo_title' if n else 'SEO заполнено',
                 fix_action='fix_seo_titles' if n else None,
                 view_action='view_listings_no_seo' if n else None)
        except Exception as e:
            _chk('SEO объявлений', False, str(e)[:80])

        # 12. Новости — опубликованные
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.news WHERE is_published=TRUE "
                f"AND created_at > NOW() - INTERVAL '30 days'"
            )
            n = cur.fetchone()['c']
            _chk('Свежие новости', n > 0,
                 f'{n} за последние 30 дней' if n else 'Нет новостей за месяц')
        except Exception as e:
            _chk('Свежие новости', True, 'нет данных')

        total = len(checks)
        passed = sum(1 for c in checks if c['ok'])
        score = round(passed / total * 100) if total else 0
        return _ok({'checks': checks, 'score': score, 'passed': passed, 'total': total})

    # ── АНТИВИРУС / БЕЗОПАСНОСТЬ ─────────────────────────────────────────────
    if action == 'scan_security':
        import re as _re
        threats = []
        warnings = []

        # 1. XSS в объявлениях
        try:
            cur.execute(
                f"SELECT id, title FROM {SCHEMA}.listings "
                f"WHERE LOWER(COALESCE(description,'')) LIKE '%<script%' "
                f"OR LOWER(COALESCE(title,'')) LIKE '%<script%' "
                f"OR LOWER(COALESCE(description,'')) LIKE '%javascript:%' "
                f"OR LOWER(COALESCE(description,'')) LIKE '%onerror=%' "
                f"OR LOWER(COALESCE(description,'')) LIKE '%onclick=%'"
            )
            rows = cur.fetchall()
            for r in rows:
                threats.append({'type': 'XSS', 'where': f'Объявление #{r["id"]}: {(r["title"] or "")[:60]}'})
        except Exception as e:
            warnings.append(f'Ошибка проверки XSS: {str(e)[:80]}')

        # 2. SQL-инъекции в пользовательских полях (поиск характерных паттернов)
        try:
            cur.execute(
                f"SELECT id FROM {SCHEMA}.leads "
                f"WHERE LOWER(COALESCE(comment,'')) SIMILAR TO '%(''; DROP|UNION SELECT|OR 1=1|--'')%'"
            )
            rows = cur.fetchall()
            for r in rows:
                threats.append({'type': 'SQL Injection', 'where': f'Лид #{r["id"]}'})
        except Exception:
            pass

        # 3. Подозрительные email в пользователях
        try:
            cur.execute(
                f"SELECT id, email FROM {SCHEMA}.users "
                f"WHERE LOWER(email) LIKE '%+%@%' OR LOWER(email) LIKE '%.ru.%' "
                f"ORDER BY created_at DESC LIMIT 100"
            )
            rows = cur.fetchall()
        except Exception:
            rows = []

        # 4. Множественные неудачные входы (brute force) — сессии с коротким lifetime
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.user_sessions "
                f"WHERE created_at > NOW() - INTERVAL '1 hour'"
            )
            recent = cur.fetchone()['c']
            if recent > 100:
                warnings.append(f'Аномальная активность: {recent} сессий за последний час (возможный brute force)')
        except Exception:
            pass

        # 5. Пользователи без подтверждённой почты с правами admin
        try:
            cur.execute(
                f"SELECT id, email, name FROM {SCHEMA}.users "
                f"WHERE role = 'admin' AND is_active = TRUE"
            )
            admins = cur.fetchall()
            admin_list = [f'{r["name"] or r["email"]} (#{r["id"]})' for r in admins]
        except Exception:
            admin_list = []

        # 6. Открытые внешние ссылки в описаниях (фишинг)
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings "
                f"WHERE LOWER(COALESCE(description,'')) SIMILAR TO '%(http://|https://)%' "
                f"AND status='active'"
            )
            ext_links = cur.fetchone()['c']
        except Exception:
            ext_links = 0

        # 7. Пароли/токены в открытом виде в настройках
        try:
            cur.execute(
                f"SELECT yandex_api_key IS NOT NULL AND yandex_api_key != '' AS has_api_key "
                f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
            )
            row = cur.fetchone()
            has_key = row and row.get('has_api_key')
        except Exception:
            has_key = False

        # 8. Проверка старых неиспользуемых аккаунтов
        try:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM {SCHEMA}.users "
                f"WHERE is_active = TRUE AND last_login_at < NOW() - INTERVAL '180 days' "
                f"AND role NOT IN ('admin', 'director')"
            )
            old_users = cur.fetchone()['c']
        except Exception:
            old_users = 0

        return _ok({
            'threats': threats,
            'warnings': warnings,
            'threat_count': len(threats),
            'admins': admin_list,
            'external_links_in_listings': ext_links,
            'old_inactive_users': old_users,
            'api_key_configured': has_key,
            'safe': len(threats) == 0 and len(warnings) == 0,
        })

    # ── ПРОВЕРКА БИТЫХ ФОТО ──────────────────────────────────────────────────
    if action == 'scan_photos':
        import urllib.request as _ur2
        # Берём объявления с внешними фото (не CDN)
        cur.execute(
            f"SELECT id, image, images FROM {SCHEMA}.listings "
            f"WHERE status='active' AND image IS NOT NULL AND image != '' "
            f"AND image NOT LIKE '%cdn.poehali.dev%' "
            f"LIMIT 30"
        )
        rows = cur.fetchall()
        broken = []
        ok_count = 0
        for r in rows:
            urls = []
            if r.get('images'):
                urls = [u.strip() for u in str(r['images']).split('|') if u.strip()]
            elif r.get('image'):
                urls = [r['image']]
            for url in urls[:3]:  # проверяем первые 3 фото на объявление
                try:
                    req2 = _ur2.Request(url, method='HEAD',
                                        headers={'User-Agent': 'Mozilla/5.0'})
                    resp = _ur2.urlopen(req2, timeout=4)
                    if resp.status == 200:
                        ok_count += 1
                    else:
                        broken.append({'id': r['id'], 'url': url[:100], 'status': resp.status})
                except Exception as e:
                    broken.append({'id': r['id'], 'url': url[:100], 'status': str(e)[:50]})
        return _ok({
            'broken': broken,
            'broken_count': len(broken),
            'ok_count': ok_count,
            'scanned': len(rows),
            'message': f'Проверено {len(rows)} объявлений, найдено {len(broken)} битых фото'
        })

    # ── СТАТИСТИКА S3 (из БД, т.к. листинг S3 недоступен на этом эндпоинте) ──
    if action == 's3_stats':
        photos_count = 0
        news_count = 0
        uploads_count = 0

        try:
            cur.execute(f"""
                SELECT COALESCE(SUM(
                    CASE WHEN images IS NOT NULL AND images != ''
                    THEN array_length(string_to_array(images, '|'), 1) ELSE 0 END
                ), 0) AS cnt FROM {SCHEMA}.listings
            """)
            row = cur.fetchone()
            photos_count = int(row[0] if isinstance(row, tuple) else row.get('cnt', 0) or 0)
        except Exception:
            pass

        try:
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.news WHERE image IS NOT NULL AND image != ''")
            row = cur.fetchone()
            news_count = int(row[0] if isinstance(row, tuple) else row.get('count', 0) or 0)
        except Exception:
            pass

        try:
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.listings WHERE image IS NOT NULL AND image != ''")
            row = cur.fetchone()
            uploads_count = int(row[0] if isinstance(row, tuple) else row.get('count', 0) or 0)
        except Exception:
            pass

        total_files = photos_count + news_count
        folders = {
            'photos': photos_count,
            'news': news_count,
            'uploads': uploads_count,
        }
        project_id = os.environ.get('AWS_ACCESS_KEY_ID', '')
        cdn_base = f'https://cdn.poehali.dev/projects/{project_id}/bucket'
        return _ok({
            'total_files': total_files,
            'total_size_bytes': 0,
            'total_size_human': 'Н/Д',
            'folders': folders,
            'cdn_base': cdn_base,
            'source': 'db',
        })

    # ── ПРОВЕРКА XML-ФИДОВ ───────────────────────────────────────────────────
    if action == 'xml_check':
        import urllib.request as _ur3
        import xml.etree.ElementTree as ET

        XML_FEED_URL = 'https://functions.poehali.dev/2e0b59c3-d76b-4a2e-ae96-a40cfe5f6ef7'
        DEFAULT_FEEDS = [
            {'name': 'Яндекс.Недвижимость', 'slug': 'yandex'},
            {'name': 'Авито',               'slug': 'avito'},
            {'name': 'ЦИАН',                'slug': 'cian'},
        ]

        feeds_to_check = []
        try:
            cur.execute(f"SELECT id, slug, name, format, is_active FROM {SCHEMA}.xml_feeds WHERE is_active=TRUE ORDER BY id LIMIT 20")
            db_feeds = cur.fetchall()
            for f in db_feeds:
                row = dict(f)
                slug = row.get('slug') or row.get('format') or ''
                label = row.get('name') or slug
                if slug:
                    feeds_to_check.append({'name': label, 'url': f'{XML_FEED_URL}?type={slug}'})
        except Exception:
            pass

        if not feeds_to_check:
            feeds_to_check = [
                {'name': d['name'], 'url': f'{XML_FEED_URL}?type={d["slug"]}'}
                for d in DEFAULT_FEEDS
            ]

        results = []
        for feed in feeds_to_check:
            try:
                _req3 = _ur3.Request(feed['url'], headers={'User-Agent': 'Mozilla/5.0'})
                _resp3 = _ur3.urlopen(_req3, timeout=15)
                http_status = _resp3.status

                item_count = 0
                root_tag = ''
                total_bytes = 0
                parser = ET.XMLPullParser(events=('start',))
                try:
                    while True:
                        chunk = _resp3.read(32768)
                        if not chunk:
                            break
                        total_bytes += len(chunk)
                        parser.feed(chunk)
                        for _ev, elem in parser.read_events():
                            if not root_tag:
                                root_tag = elem.tag
                            elif elem.tag != root_tag:
                                item_count += 1
                            elem.clear()
                        if total_bytes > 10 * 1024 * 1024:
                            break
                    results.append({
                        'name': feed['name'],
                        'ok': True,
                        'status': http_status,
                        'root_tag': root_tag.split('}')[-1] if root_tag else '',
                        'items': item_count,
                        'size_kb': round(total_bytes / 1024, 1),
                    })
                except ET.ParseError as pe:
                    results.append({
                        'name': feed['name'],
                        'ok': False,
                        'status': http_status,
                        'error': f'Невалидный XML: {str(pe)[:100]}',
                        'size_kb': round(total_bytes / 1024, 1),
                    })
            except Exception as e:
                results.append({'name': feed['name'], 'ok': False, 'error': str(e)[:200]})

        all_ok = all(f.get('ok') for f in results)
        return _ok({'feeds': results, 'all_ok': all_ok, 'checked': len(results)})

    # ── КАЧЕСТВО ОБЪЕКТОВ ДЛЯ XML-ЭКСПОРТА ───────────────────────────────────
    if action == 'xml_quality':
        cur.execute(f"""
            SELECT id, title, category, deal, price, area, address, lat, lng,
                   floor, total_floors, ceiling_height, condition, images, description
            FROM {SCHEMA}.listings
            WHERE status = 'active'
            ORDER BY id DESC
        """)
        rows = cur.fetchall()

        FIELDS = [
            ('title',          'Название'),
            ('description',    'Описание'),
            ('price',          'Цена'),
            ('area',           'Площадь'),
            ('address',        'Адрес'),
            ('lat',            'Координаты'),
            ('images',         'Фотографии'),
            ('floor',          'Этаж'),
            ('ceiling_height', 'Высота потолков'),
            ('condition',      'Состояние'),
        ]

        issues = []
        field_stats = {k: 0 for k, _ in FIELDS}

        for row in rows:
            r = dict(row)
            missing = []
            for key, label in FIELDS:
                val = r.get(key)
                is_empty = (val is None or val == '' or (key not in ('lat', 'lng') and val == 0))
                if is_empty:
                    missing.append(label)
                    field_stats[key] += 1
            if missing:
                issues.append({
                    'id': r['id'],
                    'title': r.get('title') or f'Объект #{r["id"]}',
                    'missing': missing,
                })

        total = len(rows)
        perfect = total - len(issues)
        field_summary = [
            {'key': k, 'label': l, 'count': field_stats[k]}
            for k, l in FIELDS if field_stats[k] > 0
        ]
        field_summary.sort(key=lambda x: -x['count'])

        return _ok({
            'total': total,
            'perfect': perfect,
            'issues_count': len(issues),
            'issues': issues[:50],
            'field_summary': field_summary,
        })

    # ── МАРКЕТИНГОВАЯ АНАЛИТИКА ──────────────────────────────────────────────
    if action == 'marketing_stats':
        # 1. Лиды по источникам
        cur.execute(f"""
            SELECT COALESCE(NULLIF(source,''), 'Не указан') AS source,
                   COUNT(*) AS cnt
            FROM {SCHEMA}.leads
            GROUP BY 1 ORDER BY cnt DESC
        """)
        leads_by_source = [dict(r) for r in cur.fetchall()]

        # 2. Лиды по статусам
        cur.execute(f"""
            SELECT COALESCE(NULLIF(status,''), 'Не указан') AS status,
                   COUNT(*) AS cnt
            FROM {SCHEMA}.leads
            GROUP BY 1 ORDER BY cnt DESC
        """)
        leads_by_status = [dict(r) for r in cur.fetchall()]

        # 3. Лиды за последние 30 дней (по дням)
        cur.execute(f"""
            SELECT DATE(created_at) AS day, COUNT(*) AS cnt
            FROM {SCHEMA}.leads
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY 1 ORDER BY 1
        """)
        leads_timeline = [{'day': str(r['day']), 'cnt': r['cnt']} for r in cur.fetchall()]

        # 4. Статистика просмотров по источникам
        cur.execute(f"""
            SELECT COALESCE(NULLIF(source,''), 'site') AS source,
                   event_type,
                   SUM(count) AS total
            FROM {SCHEMA}.listing_stats
            GROUP BY 1, 2 ORDER BY total DESC
        """)
        stats_raw = cur.fetchall()
        views_by_source = {}
        for r in stats_raw:
            s = r['source']
            if s not in views_by_source:
                views_by_source[s] = {}
            views_by_source[s][r['event_type']] = r['total']

        # 5. Топ объектов по просмотрам
        cur.execute(f"""
            SELECT id, title, category, deal, views_site, price
            FROM {SCHEMA}.listings
            WHERE status = 'active' AND views_site > 0
            ORDER BY views_site DESC LIMIT 10
        """)
        top_listings = [dict(r) for r in cur.fetchall()]

        # 6. Статистика объектов по категориям (просмотры + количество)
        cur.execute(f"""
            SELECT category, deal,
                   COUNT(*) AS cnt,
                   SUM(views_site) AS total_views,
                   ROUND(AVG(views_site)::numeric, 1) AS avg_views
            FROM {SCHEMA}.listings
            WHERE status = 'active'
            GROUP BY 1, 2 ORDER BY total_views DESC NULLS LAST
        """)
        listings_stats = [dict(r) for r in cur.fetchall()]

        # 7. Сделки CRM по источникам
        cur.execute(f"""
            SELECT COALESCE(NULLIF(source,''), 'Не указан') AS source,
                   COUNT(*) AS cnt,
                   COALESCE(SUM(amount), 0) AS total_amount
            FROM {SCHEMA}.crm_deals
            GROUP BY 1 ORDER BY cnt DESC
        """)
        deals_by_source = [dict(r) for r in cur.fetchall()]

        # 8. Общие итоги
        cur.execute(f"""
            SELECT
                (SELECT COUNT(*) FROM {SCHEMA}.leads) AS total_leads,
                (SELECT COUNT(*) FROM {SCHEMA}.leads WHERE created_at >= NOW() - INTERVAL '30 days') AS leads_30d,
                (SELECT COALESCE(SUM(views_site),0) FROM {SCHEMA}.listings WHERE status='active') AS total_views,
                (SELECT COUNT(*) FROM {SCHEMA}.listings WHERE status='active') AS active_listings,
                (SELECT COUNT(*) FROM {SCHEMA}.crm_deals) AS total_deals
        """)
        totals = dict(cur.fetchone())

        return _ok({
            'totals': totals,
            'leads_by_source': leads_by_source,
            'leads_by_status': leads_by_status,
            'leads_timeline': leads_timeline,
            'views_by_source': views_by_source,
            'top_listings': top_listings,
            'listings_stats': listings_stats,
            'deals_by_source': deals_by_source,
        })

    # ── ДЕЙСТВИЯ ОБСЛУЖИВАНИЯ ────────────────────────────────────────────────
    if action == 'clear_ai_logs':
        try:
            cur.execute(
                f"DELETE FROM {SCHEMA}.ai_logs "
                f"WHERE created_at < NOW() - INTERVAL '30 days'"
            )
            deleted = cur.rowcount
            conn.commit()
            return _ok({'success': True, 'deleted': deleted, 'message': f'Удалено {deleted} старых записей логов ИИ'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'clear_old_sessions':
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.sessions WHERE expires_at < NOW()")
            deleted = cur.rowcount
            conn.commit()
            return _ok({'success': True, 'deleted': deleted, 'message': f'Удалено {deleted} истёкших сессий'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'clear_orphan_leads':
        try:
            cur.execute(
                f"DELETE FROM {SCHEMA}.leads "
                f"WHERE (phone IS NULL OR phone='') "
                f"AND created_at < NOW() - INTERVAL '7 days'"
            )
            deleted = cur.rowcount
            conn.commit()
            return _ok({'success': True, 'deleted': deleted, 'message': f'Удалено {deleted} лидов без телефона'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'vacuum_stats':
        try:
            cur.execute(
                f"DELETE FROM {SCHEMA}.listing_stats "
                f"WHERE recorded_at < NOW() - INTERVAL '90 days'"
            )
            deleted = cur.rowcount
            conn.commit()
            return _ok({'success': True, 'deleted': deleted, 'message': f'Удалено {deleted} старых записей статистики'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'fix_slugs':
        try:
            cur.execute(
                f"SELECT id, title FROM {SCHEMA}.news WHERE slug IS NULL OR slug=''"
            )
            rows = cur.fetchall()
            fixed = 0
            for r in rows:
                raw = (r['title'] or '').lower()
                import re as _re
                slug = _re.sub(r'[^a-z0-9а-яё]+', '-', raw, flags=_re.I).strip('-')[:60]
                slug = slug + f'-{r["id"]}'
                cur.execute(
                    f"UPDATE {SCHEMA}.news SET slug='{_safe(slug, 100)}' WHERE id={r['id']}"
                )
                fixed += 1
            conn.commit()
            return _ok({'success': True, 'fixed': fixed, 'message': f'Исправлено {fixed} slug новостей'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'fix_broken_photos':
        import urllib.request as _ur4
        try:
            cur.execute(
                f"SELECT id, image, images FROM {SCHEMA}.listings "
                f"WHERE status='active' AND image IS NOT NULL AND image != '' "
                f"AND image NOT LIKE '%cdn.poehali.dev%'"
            )
            rows = cur.fetchall()
            fixed = 0
            for r in rows:
                urls = [u.strip() for u in str(r.get('images') or r.get('image') or '').split('|') if u.strip()]
                good = []
                for url in urls:
                    try:
                        req4 = _ur4.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
                        resp = _ur4.urlopen(req4, timeout=3)
                        if resp.status == 200:
                            good.append(url)
                    except Exception:
                        pass  # битая — пропускаем
                new_images = '|'.join(good)
                new_image = good[0] if good else ''
                cur.execute(
                    f"UPDATE {SCHEMA}.listings SET image='{_safe(new_image)}', images='{_safe(new_images, 5000)}' "
                    f"WHERE id={r['id']}"
                )
                fixed += 1
            conn.commit()
            return _ok({'success': True, 'fixed': fixed, 'message': f'Обработано {fixed} объявлений — битые фото удалены'})
        except Exception as e:
            return _err(500, str(e)[:200])

    # ── VIEW-ACTIONS (GET-запросы для просмотра деталей) ─────────────────────
    if action == 'view_listings_no_desc':
        cur.execute(
            f"SELECT id, title, status, price, created_at FROM {SCHEMA}.listings "
            f"WHERE status='active' AND COALESCE(LENGTH(description),0) < 30 "
            f"ORDER BY created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'view_listings_no_price':
        cur.execute(
            f"SELECT id, title, status, created_at FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (price IS NULL OR price = 0) "
            f"ORDER BY created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'view_orphan_leads':
        cur.execute(
            f"SELECT id, name, email, comment, created_at FROM {SCHEMA}.leads "
            f"WHERE (phone IS NULL OR phone='') AND created_at < NOW() - INTERVAL '7 days' "
            f"ORDER BY created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'view_duplicates':
        cur.execute(
            f"SELECT title, price, COUNT(*) AS cnt, "
            f"ARRAY_AGG(id ORDER BY id) AS ids "
            f"FROM {SCHEMA}.listings "
            f"WHERE status='active' AND title IS NOT NULL AND title != '' "
            f"GROUP BY title, price HAVING COUNT(*) > 1 "
            f"ORDER BY cnt DESC LIMIT 30"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'view_xss':
        cur.execute(
            f"SELECT id, title, "
            f"SUBSTRING(COALESCE(description,''),1,200) AS description_preview "
            f"FROM {SCHEMA}.listings "
            f"WHERE LOWER(COALESCE(description,'')) LIKE '%<script%' "
            f"OR LOWER(COALESCE(title,'')) LIKE '%<script%' "
            f"OR LOWER(COALESCE(description,'')) LIKE '%javascript:%' "
            f"ORDER BY id DESC LIMIT 30"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'view_listings_no_seo':
        cur.execute(
            f"SELECT id, title, price, created_at FROM {SCHEMA}.listings "
            f"WHERE status='active' AND (seo_title IS NULL OR seo_title='') "
            f"ORDER BY created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        return _ok({'items': rows, 'total': len(rows)})

    if action == 'open_settings':
        return _ok({'redirect': '/admin/settings', 'message': 'Перейдите в настройки сайта'})

    if action == 'view_settings':
        cur.execute(
            f"SELECT id, company_name, company_phone, company_email, company_address, "
            f"seo_description, hero_title, hero_subtitle, about_text, main_city "
            f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return _ok({'fields': [], 'exists': False, 'message': 'Строка настроек не создана'})
        FIELD_LABELS = {
            'company_name': 'Название компании',
            'company_phone': 'Телефон',
            'company_email': 'Email',
            'company_address': 'Адрес',
            'seo_description': 'SEO-описание сайта',
            'hero_title': 'Заголовок главной страницы',
            'hero_subtitle': 'Подзаголовок главной',
            'about_text': 'О компании',
            'main_city': 'Основной город',
        }
        fields = []
        for k, label in FIELD_LABELS.items():
            val = row.get(k) or ''
            fields.append({'key': k, 'label': label, 'value': val, 'filled': bool(val)})
        return _ok({'fields': fields, 'exists': True})

    # ── FIX-ACTIONS ───────────────────────────────────────────────────────────
    if method != 'POST':
        return _err(405, 'Метод не поддерживается')

    if action == 'fix_seo_titles':
        try:
            cur.execute(
                f"SELECT id FROM {SCHEMA}.listings "
                f"WHERE status='active' AND (seo_title IS NULL OR seo_title='' "
                f"OR seo_description IS NULL OR seo_description='')"
            )
            rows = cur.fetchall()
            fixed = 0
            for r in rows:
                _auto_seo(cur, r['id'])
                fixed += 1
            conn.commit()
            return _ok({'success': True, 'fixed': fixed,
                        'message': f'SEO-теги проставлены для {fixed} объявлений'})
        except Exception as e:
            return _err(500, str(e)[:200])

    if action == 'ai_fix_settings':
        import urllib.request as _ur2
        _headers = event.get('headers') or {}
        token = (_headers.get('X-Auth-Token') or _headers.get('x-auth-token') or
                 (event.get('queryStringParameters') or {}).get('auth_token') or '')
        try:
            # Берём контекст: объявления, новости, лиды
            ctx_parts = []
            try:
                cur.execute(f"SELECT title, description, price FROM {SCHEMA}.listings WHERE status='active' ORDER BY id DESC LIMIT 5")
                rows = cur.fetchall()
                if rows:
                    ctx_parts.append('Объявления: ' + '; '.join(
                        f"{r['title']} ({r['price']} руб.)" for r in rows if r.get('title')
                    ))
            except Exception:
                pass
            try:
                cur.execute(f"SELECT title, body FROM {SCHEMA}.news WHERE is_published=TRUE ORDER BY id DESC LIMIT 3")
                rows = cur.fetchall()
                if rows:
                    ctx_parts.append('Новости: ' + '; '.join(r['title'] for r in rows if r.get('title')))
            except Exception:
                pass
            try:
                cur.execute(f"SELECT company_name, company_phone, company_email, company_address, main_city FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
                s = cur.fetchone() or {}
                existing = {k: v for k, v in s.items() if v}
                if existing:
                    ctx_parts.append('Уже заполнено: ' + ', '.join(f"{k}={v}" for k, v in existing.items()))
            except Exception:
                pass

            context_str = '\n'.join(ctx_parts) if ctx_parts else 'Нет данных'
            prompt = (
                "На основе контекста сайта сгенерируй реалистичные значения для незаполненных настроек. "
                "Верни строго JSON (без markdown, без пояснений) с полями которые нужно заполнить из списка: "
                "company_name, meta_title, seo_description, hero_title, hero_subtitle, about_text. "
                "Заполни только те поля, для которых можно угадать значение из контекста. "
                f"Контекст:\n{context_str}"
            )

            ai_url = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef'
            ai_body = json.dumps({'action': 'describe', 'prompt': prompt, 'context_data': {}}).encode()
            ai_req = _ur2.Request(ai_url, data=ai_body,
                                  headers={'Content-Type': 'application/json', 'X-Auth-Token': token},
                                  method='POST')
            with _ur2.urlopen(ai_req, timeout=45) as resp:
                ai_raw = json.loads(resp.read().decode())

            ai_text = ai_raw.get('text') or ''
            # Парсим JSON из ответа ИИ
            import re as _re2
            json_match = _re2.search(r'\{[\s\S]+\}', ai_text)
            if not json_match:
                return _err(500, f'ИИ не вернул JSON: {ai_text[:200]}')
            suggested = json.loads(json_match.group())

            # Обновляем только пустые поля
            ALLOWED = {'company_name', 'meta_title', 'seo_description', 'hero_title', 'hero_subtitle', 'about_text'}
            cur.execute(f"SELECT id, company_name, meta_title, seo_description, hero_title, hero_subtitle, about_text FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
            cur_row = cur.fetchone()
            if not cur_row:
                return _err(404, 'Строка настроек не найдена')

            updates = []
            applied = {}
            for k, v in suggested.items():
                if k not in ALLOWED:
                    continue
                if cur_row.get(k):
                    continue  # не перезаписываем заполненные
                v_clean = str(v).strip()[:500]
                if not v_clean:
                    continue
                updates.append(f"{k}='{_safe(v_clean, 500)}'")
                applied[k] = v_clean

            if updates:
                cur.execute(f"UPDATE {SCHEMA}.settings SET {', '.join(updates)} WHERE id={cur_row['id']}")
                conn.commit()

            return _ok({
                'success': True,
                'applied': applied,
                'message': f'ИИ заполнил {len(applied)} полей: {", ".join(applied.keys())}' if applied else 'ИИ не нашёл что заполнять — все поля уже заполнены'
            })
        except Exception as e:
            return _err(500, str(e)[:300])

    # ── FIX: дубли — деактивируем все кроме первого в каждой группе ──────────
    if action == 'fix_duplicates':
        try:
            cur.execute(
                f"SELECT title, price, ARRAY_AGG(id ORDER BY id) AS ids "
                f"FROM {SCHEMA}.listings "
                f"WHERE status='active' AND title IS NOT NULL AND title != '' "
                f"GROUP BY title, price HAVING COUNT(*) > 1"
            )
            groups = cur.fetchall()
            deactivated = []
            for g in groups:
                # Оставляем первый (минимальный id), остальные → archived
                to_deactivate = g['ids'][1:]
                for lid in to_deactivate:
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET status='archived' WHERE id={int(lid)}"
                    )
                    deactivated.append(lid)
            conn.commit()
            return _ok({
                'success': True,
                'deactivated': deactivated,
                'message': f'Убрано {len(deactivated)} дублей из {len(groups)} групп — оставлен первый экземпляр каждого'
            })
        except Exception as e:
            return _err(500, str(e)[:200])

    # ── FIX: описания — ИИ генерирует текст для пустых объявлений ────────────
    if action == 'ai_fix_descriptions':
        import urllib.request as _ur3
        _hdrs = event.get('headers') or {}
        token = (_hdrs.get('X-Auth-Token') or _hdrs.get('x-auth-token') or
                 (event.get('queryStringParameters') or {}).get('auth_token') or '')
        try:
            cur.execute(
                f"SELECT id, title, price, address, area FROM {SCHEMA}.listings "
                f"WHERE status='active' AND COALESCE(LENGTH(description),0) < 30 "
                f"LIMIT 20"
            )
            rows = cur.fetchall()
            fixed = 0
            errors = []
            ai_url = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef'
            for r in rows:
                parts = []
                if r.get('title'): parts.append(f"Название: {r['title']}")
                if r.get('price'): parts.append(f"Цена: {r['price']} руб.")
                if r.get('address'): parts.append(f"Адрес: {r['address']}")
                if r.get('area'): parts.append(f"Площадь: {r['area']} кв.м.")
                if not parts:
                    parts.append(f"Коммерческая недвижимость, ID {r['id']}")
                prompt_text = (
                    "Напиши продающее описание объекта недвижимости (4-6 предложений). "
                    "Только текст, без заголовков и списков. "
                    "Данные объекта:\n" + '\n'.join(parts)
                )
                ai_body = json.dumps({
                    'action': 'describe',
                    'prompt': prompt_text,
                    'context_data': {}
                }).encode()
                ai_req = _ur3.Request(
                    ai_url, data=ai_body,
                    headers={'Content-Type': 'application/json', 'X-Auth-Token': token},
                    method='POST'
                )
                try:
                    with _ur3.urlopen(ai_req, timeout=30) as resp:
                        ai_raw = json.loads(resp.read().decode())
                    desc = (ai_raw.get('text') or '').strip()
                    if desc and len(desc) >= 30:
                        cur.execute(
                            f"UPDATE {SCHEMA}.listings SET description='{_safe(desc, 3000)}' "
                            f"WHERE id={int(r['id'])}"
                        )
                        fixed += 1
                    else:
                        errors.append(r['id'])
                except Exception as ex:
                    errors.append(r['id'])
            conn.commit()
            msg = f'ИИ написал описание для {fixed} объявлений'
            if errors:
                msg += f', не удалось: {len(errors)} шт.'
            return _ok({'success': True, 'fixed': fixed, 'errors': errors, 'message': msg})
        except Exception as e:
            return _err(500, str(e)[:300])

    return _err(400, 'Неизвестное действие')


def _consent_log(cur, conn, method, event, user):
    """Журнал принятых согласий. Только admin/director.
    GET ?resource=consent_log — список с фильтрами
    GET ?resource=consent_log&action=stats — счётчики (всего/сегодня/7д/30д)
    GET ?resource=consent_log&action=export — CSV
    """
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Доступ только для администратора и директора')
    if method != 'GET':
        return _err(405, 'Метод не поддерживается')

    params = event.get('queryStringParameters') or {}
    action = params.get('action') or ''

    # Счётчики
    if action == 'stats':
        cur.execute(
            f"SELECT "
            f"COUNT(*) AS total, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '1 day') AS today, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '7 days') AS week, "
            f"COUNT(*) FILTER (WHERE accepted_at >= NOW() - INTERVAL '30 days') AS month "
            f"FROM {SCHEMA}.consent_log"
        )
        row = cur.fetchone()
        return _ok({
            'total': int(row['total'] or 0),
            'today': int(row['today'] or 0),
            'week': int(row['week'] or 0),
            'month': int(row['month'] or 0),
        })

    # Фильтры
    where = ['1=1']
    date_from = params.get('date_from')
    date_to = params.get('date_to')
    ip_filter = params.get('ip')
    period = params.get('period')  # today|week|month
    if period == 'today':
        where.append("accepted_at >= NOW() - INTERVAL '1 day'")
    elif period == 'week':
        where.append("accepted_at >= NOW() - INTERVAL '7 days'")
    elif period == 'month':
        where.append("accepted_at >= NOW() - INTERVAL '30 days'")
    if date_from:
        where.append(f"accepted_at >= '{_safe(date_from, 50)}'")
    if date_to:
        where.append(f"accepted_at <= '{_safe(date_to, 50)}'")
    if ip_filter:
        ip_s = _safe(ip_filter, 100)
        where.append(f"ip_address LIKE '%{ip_s}%'")
    where_sql = ' AND '.join(where)

    # CSV-экспорт
    if action == 'export':
        cur.execute(
            f"SELECT id, accepted_at, ip_address, user_agent, documents_opened, page_url, session_id "
            f"FROM {SCHEMA}.consent_log WHERE {where_sql} ORDER BY accepted_at DESC LIMIT 10000"
        )
        rows = cur.fetchall()
        lines = ['id;accepted_at;ip;user_agent;documents_opened;page_url;session_id']
        for r in rows:
            d = dict(r)
            docs = d.get('documents_opened') or []
            if not isinstance(docs, list):
                try:
                    docs = json.loads(docs) if isinstance(docs, str) else []
                except Exception:
                    docs = []
            docs_str = '+'.join(str(x) for x in docs)
            ua = (d.get('user_agent') or '').replace(';', ',').replace('\n', ' ')[:300]
            line = ';'.join([
                str(d.get('id') or ''),
                d.get('accepted_at').isoformat() if d.get('accepted_at') else '',
                d.get('ip_address') or '',
                ua,
                docs_str,
                (d.get('page_url') or '')[:200],
                (d.get('session_id') or '')[:100],
            ])
            lines.append(line)
        csv = '\n'.join(lines)
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="consent_log.csv"',
            },
            'body': csv,
        }

    # Список с пагинацией
    page = max(1, int(params.get('page') or 1))
    limit = min(int(params.get('limit') or 50), 200)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.consent_log WHERE {where_sql}")
    total = int(cur.fetchone()['c'] or 0)

    cur.execute(
        f"SELECT id, accepted_at, ip_address, user_agent, documents_opened, page_url, session_id "
        f"FROM {SCHEMA}.consent_log WHERE {where_sql} "
        f"ORDER BY accepted_at DESC LIMIT {limit} OFFSET {offset}"
    )
    items = []
    for r in cur.fetchall():
        d = dict(r)
        if d.get('accepted_at'):
            try:
                d['accepted_at'] = d['accepted_at'].isoformat()
            except Exception:
                d['accepted_at'] = str(d['accepted_at'])
        items.append(d)
    return _ok({'logs': items, 'total': total, 'page': page, 'limit': limit})


def _normalize_district(cur, district: str) -> str:
    """
    Приводит district к каноничному значению из таблицы districts.
    Точное совпадение → возврат как есть.
    ILIKE совпадение → возврат канонического имени из справочника.
    Не найдено → возврат исходной строки (не ломаем данные).
    """
    if not district or not district.strip():
        return district
    d = district.strip()
    try:
        # Точное совпадение
        cur.execute(
            f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE AND name = %s LIMIT 1",
            (d,)
        )
        row = cur.fetchone()
        if row:
            return row['name']
        # Нечёткое: ищем по вхождению в обе стороны
        cur.execute(
            f"SELECT name FROM {SCHEMA}.districts "
            f"WHERE is_active = TRUE AND (name ILIKE %s OR %s ILIKE '%%' || name || '%%') "
            f"ORDER BY LENGTH(name) DESC LIMIT 1",
            (f'%{d}%', d)
        )
        row = cur.fetchone()
        if row:
            print(f'[normalize_district] "{d}" → "{row["name"]}"')
            return row['name']
    except Exception as e:
        print(f'[normalize_district] error: {e}')
    return d  # не нашли — возвращаем как есть


def _auto_district(cur, address: str, city: str = 'Краснодар') -> str:
    """Определяет район по адресу через YandexGPT. Возвращает название из справочника или ''."""
    if not address or not address.strip():
        return ''
    import urllib.request, urllib.error
    api_key = os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key or not folder_id:
        try:
            cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
            row = cur.fetchone()
            if row:
                api_key = row.get('yandex_api_key') or api_key
                folder_id = row.get('yandex_folder_id') or folder_id
        except Exception:
            pass
    if not api_key or not folder_id:
        return ''
    try:
        cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC")
        districts = [r['name'] for r in cur.fetchall()]
    except Exception:
        return ''
    if not districts:
        return ''
    districts_numbered = '\n'.join([f'{i+1}. {d}' for i, d in enumerate(districts)])
    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt-5-pro/latest',
        'completionOptions': {'stream': False, 'temperature': 0.05, 'maxTokens': '10'},
        'messages': [
            {'role': 'system', 'text': (
                f'Ты — риелтор-эксперт по микрорайонам {city}а. '
                f'По адресу определи ОДИН номер микрорайона из списка ниже.\n'
                f'Правила:\n'
                f'- Отвечай ТОЛЬКО цифрой (номером из списка), ничем другим\n'
                f'- Учитывай улицу и номер дома — они определяют микрорайон\n'
                f'- Если улица на границе нескольких районов — выбери по номеру дома\n'
                f'- Если не знаешь точно — выбери ближайший по смыслу\n\n'
                f'Список микрорайонов {city}а:\n{districts_numbered}'
            )},
            {'role': 'user', 'text': f'Определи микрорайон для адреса: {address}'},
        ],
    }
    req = urllib.request.Request(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json', 'x-folder-id': folder_id},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        # Ищем число в ответе
        import re
        m = re.search(r'\d+', text)
        if m:
            idx = int(m.group()) - 1
            if 0 <= idx < len(districts):
                print(f'[auto_district] "{address}" → "{districts[idx]}"')
                return districts[idx]
    except Exception as e:
        print(f'[auto_district] error: {e}')
    return ''


_LISTING_FAQ_URL = 'https://functions.poehali.dev/282b9c5f-29fa-41ea-bc42-0793bdf8950d'
_PHONE_SUB_URL = 'https://functions.poehali.dev/6dfb5518-6954-4ea5-972b-c20e8d06a8ab'
_SMART_SEARCH_URL = 'https://functions.poehali.dev/32925bd2-c418-4a8c-8e32-97b5385e67da'


def _notify_phone_subscribers(listing_id: int, body: dict, cur):
    """Рассылка MAX-уведомлений подписчикам при публикации нового объекта."""
    import urllib.request
    try:
        status = body.get('status') or 'active'
        if status != 'active':
            return
        # Берём auth_token первого активного admin-пользователя для авторизации notify
        cur.execute(
            f"SELECT s.token FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"WHERE u.role IN ('admin', 'editor') AND u.is_active = TRUE AND s.expires_at > NOW() "
            f"ORDER BY s.created_at DESC LIMIT 1"
        )
        session = cur.fetchone()
        if not session:
            return
        token = session.get('token') or ''

        cur.execute(f"SELECT slug FROM {SCHEMA}.listings WHERE id = {int(listing_id)}")
        slug_row = cur.fetchone()
        slug = (slug_row.get('slug') or '') if slug_row else ''

        cur.execute(
            f"SELECT site_url FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        settings_row = cur.fetchone()
        site_url = (settings_row.get('site_url') or '').rstrip('/') if settings_row else ''
        listing_url = f'{site_url}/object/{slug}' if slug and site_url else ''

        payload = json.dumps({
            'action': 'notify',
            'listing_id': listing_id,
            'category': body.get('category') or '',
            'deal_type': body.get('deal') or '',
            'title': body.get('title') or '',
            'price': body.get('price'),
            'area': body.get('area'),
            'city': body.get('city') or 'Краснодар',
            'url': listing_url,
        }, ensure_ascii=False).encode()
        req = urllib.request.Request(
            _PHONE_SUB_URL,
            data=payload,
            headers={'Content-Type': 'application/json', 'X-Auth-Token': token},
            method='POST',
        )
        urllib.request.urlopen(req, timeout=4)
        print(f'[phone_sub] notify triggered for listing {listing_id}')
    except Exception as e:
        print(f'[phone_sub] notify error for listing {listing_id}: {e}')


_DEAL_RU = {'rent': 'Аренда', 'sale': 'Продажа', 'sale_rent': 'Аренда/Продажа'}
_CAT_RU = {
    'office': 'офисного помещения', 'retail': 'торгового помещения',
    'warehouse': 'склада', 'restaurant': 'ресторана', 'hotel': 'гостиницы',
    'business': 'готового бизнеса', 'gab': 'готового арендного бизнеса',
    'production': 'производственного помещения', 'land': 'земельного участка',
    'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервиса',
}


def _auto_seo(cur, listing_id: int):
    """Генерирует seo_title и seo_description если они пустые."""
    try:
        cur.execute(
            f"SELECT title, category, deal, area, price, address, city, seo_title, seo_description "
            f"FROM {SCHEMA}.listings WHERE id = {int(listing_id)} LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return
        d = dict(row)
        # Не перезаписываем если уже заполнены
        need_title = not (d.get('seo_title') or '').strip()
        need_desc = not (d.get('seo_description') or '').strip()
        if not need_title and not need_desc:
            return

        cat = _CAT_RU.get(d.get('category') or '', 'коммерческой недвижимости')
        deal = _DEAL_RU.get(d.get('deal') or 'rent', 'Аренда')
        area = f"{int(d['area'])} м²" if d.get('area') else ''
        price = f"{int(d['price']):,}".replace(',', ' ') + ' ₽' if d.get('price') else ''
        city = d.get('city') or 'Краснодаре'
        title_raw = d.get('title') or ''

        if need_title:
            parts = [deal, cat]
            if area:
                parts.append(area)
            parts.append(f'в {city}')
            seo_t = ' — '.join([', '.join(parts[:2])] + parts[2:])[:68]
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET seo_title = '{_safe(seo_t, 68)}' WHERE id = {int(listing_id)}"
            )

        if need_desc:
            desc_parts = [f'{deal} {cat}']
            if area:
                desc_parts.append(f'площадью {area}')
            if price:
                desc_parts.append(f'за {price}')
            if d.get('address'):
                desc_parts.append(f'по адресу {d["address"]}')
            elif city:
                desc_parts.append(f'в {city}')
            seo_d = (title_raw[:100] + '. ' if title_raw else '') + ', '.join(desc_parts)
            seo_d = seo_d[:160]
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET seo_description = '{_safe(seo_d, 160)}' WHERE id = {int(listing_id)}"
            )
    except Exception as e:
        print(f'[auto_seo] ошибка для listing {listing_id}: {e}')


def _trigger_faq_async(listing_id: int, cur):
    """Фоновый вызов listing-faq если auto_faq_enabled=True в настройках."""
    import urllib.request
    try:
        cur.execute(f"SELECT auto_faq_enabled, yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if not row or not row.get('auto_faq_enabled'):
            return
        if not row.get('yandex_api_key') or not row.get('yandex_folder_id'):
            print(f'[auto_faq] пропуск listing {listing_id}: YandexGPT не настроен')
            return
        payload = json.dumps({'listing_id': listing_id}).encode()
        req = urllib.request.Request(_LISTING_FAQ_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
        urllib.request.urlopen(req, timeout=3)
        print(f'[auto_faq] запущена генерация FAQ для listing {listing_id}')
    except Exception as e:
        print(f'[auto_faq] фоновый запуск для listing {listing_id}: {e}')


def _trigger_reindex_async(listing_id: int):
    """Обновляет эмбеддинг конкретного объекта в ИИ-поиске (fire-and-forget)."""
    import urllib.request
    try:
        payload = json.dumps({'action': 'reindex', 'ids': [listing_id]}).encode()
        req = urllib.request.Request(
            _SMART_SEARCH_URL, data=payload,
            headers={'Content-Type': 'application/json'}, method='POST'
        )
        urllib.request.urlopen(req, timeout=4)
        print(f'[reindex] запущена переиндексация listing {listing_id}')
    except Exception as e:
        print(f'[reindex] ошибка для listing {listing_id}: {e}')


def _listings(cur, conn, method, rid, event, user):
    if method == 'GET':
        if rid:
            cur.execute(
                f"SELECT l.*, u.name AS broker_name, u.id AS broker_user_id, "
                f"  pc.name AS pc_owner_name, pc.phone AS pc_owner_phone, pc.photo_url AS pc_owner_photo, "
                f"  pc.company AS pc_owner_company, pc.notes AS pc_owner_notes, "
                f"  pc2.name AS pc2_owner_name, pc2.phone AS pc2_owner_phone "
                f"FROM {SCHEMA}.listings l "
                f"LEFT JOIN {SCHEMA}.users u ON u.id = COALESCE(l.broker_id, l.author_id) "
                f"LEFT JOIN {SCHEMA}.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
                f"LEFT JOIN {SCHEMA}.phone_contacts pc2 ON pc2.id = l.owner_phone2_contact_id "
                f"WHERE l.id = {int(rid)}"
            )
            row = cur.fetchone()
            if not row:
                return _err(404, 'Не найдено')
            row_dict = dict(row)
            # Авто-миграция: если у объекта есть owner_phone, но нет связи — связываем
            if not row_dict.get('owner_phone_contact_id') and row_dict.get('owner_phone'):
                pc_id = _upsert_phone_contact(cur, row_dict.get('owner_phone'),
                                               row_dict.get('owner_name'), user['id'] if user else None)
                if pc_id:
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET owner_phone_contact_id = {pc_id} WHERE id = {int(rid)}"
                    )
                    _link_phone_to_listing(cur, pc_id, int(rid), 'owner')
                    row_dict['owner_phone_contact_id'] = pc_id
                    conn.commit()
            # Используем данные из phone_contacts (приоритет)
            if row_dict.get('pc_owner_name'):
                row_dict['owner_name'] = row_dict['pc_owner_name']
            if row_dict.get('pc_owner_phone'):
                row_dict['owner_phone'] = row_dict['pc_owner_phone']
            row_dict['owner_photo_url'] = row_dict.get('pc_owner_photo')
            row_dict['owner_company'] = row_dict.get('pc_owner_company')
            if row_dict.get('pc2_owner_phone'):
                row_dict['owner_phone2'] = row_dict['pc2_owner_phone']
            # Удаляем временные поля
            for k in ('pc_owner_name', 'pc_owner_phone', 'pc_owner_photo', 'pc_owner_company',
                      'pc_owner_notes', 'pc2_owner_name', 'pc2_owner_phone'):
                row_dict.pop(k, None)
            return _ok({'listing': _ser(row_dict)})
        qp = event.get('queryStringParameters') or {}
        limit = max(1, min(200, int(qp.get('limit') or 25)))
        offset = max(0, int(qp.get('offset') or 0))
        tab = qp.get('tab') or 'active'
        if tab == 'active':
            tab_where = "l.status = 'active' AND l.is_visible = TRUE"
        elif tab == 'archived':
            tab_where = "l.status = 'archived'"
        elif tab == 'hidden':
            tab_where = "l.status = 'active' AND l.is_visible = FALSE"
        else:
            tab_where = "TRUE"
        cur.execute(
            f"SELECT "
            f"  COUNT(*) FILTER (WHERE status = 'active' AND is_visible = TRUE) AS cnt_active, "
            f"  COUNT(*) FILTER (WHERE status = 'archived') AS cnt_archived, "
            f"  COUNT(*) FILTER (WHERE status = 'active' AND is_visible = FALSE) AS cnt_hidden "
            f"FROM {SCHEMA}.listings"
        )
        cnt = dict(cur.fetchone())
        # Брокер видит все объекты — флаг для скрытия телефона на чужих
        is_broker = user and user.get('role') == 'broker'
        broker_uid = user.get('id') if is_broker else None
        list_cols = (
            "l.id, l.title, l.category, l.deal, l.price, l.price_per_m2, l.area, "
            "l.payback, l.profit, l.floor, l.total_floors, l.address, l.district, l.city, "
            "l.image, l.images, l.tags, l.is_hot, l.is_new, l.is_exclusive, l.is_urgent, "
            "l.status, l.owner_name, l.owner_phone, l.owner_phone2, l.price_unit, "
            "l.purpose, l.condition, l.parking, l.entrance, "
            "l.export_yandex, l.export_avito, l.export_cian, "
            "l.tenant_name, l.monthly_rent, l.yearly_rent, "
            "l.finishing, l.ceiling_height, l.electricity_kw, l.utilities, l.road_line, "
            "l.author_id, l.broker_id, l.is_visible, l.rooms, l.broker_commission, "
            "l.building_class, l.building_year, l.property_rights, l.min_area, "
            "l.land_area, l.land_status, l.land_vri, l.is_apartments, "
            "l.has_furniture, l.has_equipment, l.owner_phone_contact_id, "
            "l.slug, l.public_code, l.lat, l.lng, "
            "l.created_at, l.updated_at, l.last_edited_at, l.last_edited_by, "
            "l.use_watermark, l.video_url, l.video_type, "
            "l.cadastral_number, l.egrn_objects"
        )
        cur.execute(
            f"SELECT {list_cols}, "
            f"  u.name AS broker_name, "
            f"  COALESCE(NULLIF(pc.name, ''), l.owner_name) AS owner_name_final, "
            f"  COALESCE(pc.phone, l.owner_phone) AS owner_phone_final, "
            f"  pc.photo_url AS owner_photo_url, "
            f"  COALESCE(st.views, 0) AS stats_views, "
            f"  COALESCE(st.calls, 0) AS stats_calls, "
            f"  COALESCE(sl.leads, 0) AS stats_leads, "
            f"  COUNT(*) OVER() AS _total "
            f"FROM {SCHEMA}.listings l "
            f"LEFT JOIN {SCHEMA}.users u ON u.id = COALESCE(l.broker_id, l.author_id) "
            f"LEFT JOIN {SCHEMA}.phone_contacts pc ON pc.id = l.owner_phone_contact_id "
            f"LEFT JOIN ("
            f"  SELECT listing_id, "
            f"    SUM(CASE WHEN event_type IN ('view','site_view','open','view_site') THEN count ELSE 0 END) AS views, "
            f"    SUM(CASE WHEN event_type IN ('call','phone_call','phone_click') THEN count ELSE 0 END) AS calls "
            f"  FROM {SCHEMA}.listing_stats GROUP BY listing_id"
            f") st ON st.listing_id = l.id "
            f"LEFT JOIN ("
            f"  SELECT listing_id, COUNT(*) AS leads FROM {SCHEMA}.leads "
            f"  WHERE listing_id IS NOT NULL GROUP BY listing_id"
            f") sl ON sl.listing_id = l.id "
            f"WHERE {tab_where} "
            f"ORDER BY l.created_at DESC "
            f"LIMIT {limit} OFFSET {offset}"
        )
        total = 0
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            total = d.pop('_total', 0)
            if d.get('owner_name_final'):
                d['owner_name'] = d['owner_name_final']
            if d.get('owner_phone_final'):
                d['owner_phone'] = d['owner_phone_final']
            d.pop('owner_name_final', None)
            d.pop('owner_phone_final', None)
            rows.append(_ser(d))
        return _ok({
            'listings': rows, 'total': total, 'limit': limit, 'offset': offset,
            'counts': {'active': cnt['cnt_active'], 'archived': cnt['cnt_archived'], 'hidden': cnt['cnt_hidden']},
        })

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        # Авто-определение района по адресу если не указан
        district_val = (body.get('district') or '').strip()
        if not district_val:
            address_val = (body.get('address') or '').strip()
            city_val = (body.get('city') or 'Краснодар').strip()
            district_val = _auto_district(cur, address_val, city_val)
            if district_val:
                body['district'] = district_val
        # Нормализация к каноничному названию из справочника
        if body.get('district'):
            body['district'] = _normalize_district(cur, body['district'])

        # Авто-линковка собственника с единой телефонной базой
        owner_pc_id = _upsert_phone_contact(cur, body.get('owner_phone'), body.get('owner_name'), user['id'])
        owner_pc2_id = _upsert_phone_contact(cur, body.get('owner_phone2'), body.get('owner_name'), user['id'])

        sql = (
            f"INSERT INTO {SCHEMA}.listings "
            f"(title, description, category, deal, price, price_per_m2, area, payback, profit, floor, total_floors, address, district, city, lat, lng, image, images, tags, is_hot, is_new, is_exclusive, is_urgent, status, owner_name, owner_phone, owner_phone2, price_unit, purpose, condition, parking, entrance, video_url, video_type, use_watermark, export_yandex, export_avito, export_cian, tenant_name, monthly_rent, yearly_rent, finishing, ceiling_height, electricity_kw, utilities, road_line, author_id, is_visible, rooms, broker_commission, building_class, building_year, property_rights, min_area, land_area, land_status, land_vri, is_apartments, has_furniture, has_equipment, owner_phone_contact_id, owner_phone2_contact_id, cadastral_number, egrn_objects) VALUES ("
            f"{_str_or_null(body.get('title'), 255)}, {_str_or_null(body.get('description'), 5000)}, "
            f"{_str_or_null(body.get('category'), 50)}, {_str_or_null(body.get('deal'), 20)}, "
            f"{_int_or_null(body.get('price'))}, {_int_or_null(body.get('price_per_m2'))}, "
            f"{_int_or_null(body.get('area'))}, {_int_or_null(body.get('payback'))}, "
            f"{_int_or_null(body.get('profit'))}, {_int_or_null(body.get('floor'))}, "
            f"{_int_or_null(body.get('total_floors'))}, {_str_or_null(body.get('address'), 255)}, "
            f"{_str_or_null(body.get('district'), 100)}, {_str_or_null(body.get('city') or 'Краснодар', 100)}, "
            f"{_num_or_null(body.get('lat'))}, "
            f"{_num_or_null(body.get('lng'))}, {_str_or_null(body.get('image'), 500)}, "
            f"{_str_or_null(body.get('images'), 5000)}, "
            f"{_str_or_null(body.get('tags'), 1000)}, {_bool(body.get('is_hot'))}, "
            f"{_bool(body.get('is_new'))}, {_bool(body.get('is_exclusive'))}, {_bool(body.get('is_urgent'))}, "
            f"{_str_or_null(body.get('status') or 'active', 20)}, "
            f"{_str_or_null(body.get('owner_name'), 150)}, {_str_or_null(body.get('owner_phone'), 30)}, "
            f"{_str_or_null(body.get('owner_phone2'), 30)}, "
            f"{_str_or_null(body.get('price_unit') or 'total', 10)}, "
            f"{_str_or_null(body.get('purpose'), 100)}, {_str_or_null(body.get('condition'), 50)}, "
            f"{_str_or_null(body.get('parking'), 20)}, {_str_or_null(body.get('entrance'), 20)}, "
            f"{_str_or_null(body.get('video_url'), 500)}, {_str_or_null(body.get('video_type'), 20)}, "
            f"{_bool(body.get('use_watermark', True))}, {_bool(body.get('export_yandex'))}, "
            f"{_bool(body.get('export_avito'))}, {_bool(body.get('export_cian'))}, "
            f"{_str_or_null(body.get('tenant_name'), 200)}, "
            f"{_num_or_null(body.get('monthly_rent'))}, {_num_or_null(body.get('yearly_rent'))}, "
            f"{_str_or_null(body.get('finishing'), 100)}, "
            f"{_num_or_null(body.get('ceiling_height'))}, {_num_or_null(body.get('electricity_kw'))}, "
            f"{_str_or_null(body.get('utilities'), 500)}, {_str_or_null(body.get('road_line'), 50)}, "
            f"{user['id']}, {_bool(body.get('is_visible', True))}, {_int_or_null(body.get('rooms'))}, "
            f"{_str_or_null(body.get('broker_commission'), 100)}, "
            f"{_str_or_null(body.get('building_class'), 10)}, {_int_or_null(body.get('building_year'))}, "
            f"{_str_or_null(body.get('property_rights'), 30)}, {_num_or_null(body.get('min_area'))}, "
            f"{_num_or_null(body.get('land_area'))}, {_str_or_null(body.get('land_status'), 30)}, "
            f"{_str_or_null(body.get('land_vri'), 150)}, {_bool(body.get('is_apartments'))}, "
            f"{_bool(body.get('has_furniture'))}, {_bool(body.get('has_equipment'))}, "
            f"{owner_pc_id if owner_pc_id else 'NULL'}, "
            f"{owner_pc2_id if owner_pc2_id else 'NULL'}, "
            f"{_str_or_null(body.get('cadastral_number'), 50)}, "
            f"{_jsonb_or_null(body.get('egrn_objects'))}) RETURNING id"
        )
        cur.execute(sql)
        new_id = cur.fetchone()['id']
        # Генерируем slug на основе title + id и сразу сохраняем
        new_slug = _make_slug(body.get('title') or '', new_id)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET slug = '{_safe(new_slug, 120)}' WHERE id = {new_id}"
        )
        # Связь телефон ↔ объект (для системы phonebook)
        if owner_pc_id:
            _link_phone_to_listing(cur, owner_pc_id, new_id, 'owner')
        if owner_pc2_id:
            _link_phone_to_listing(cur, owner_pc2_id, new_id, 'owner')
        # Инвалидируем кэш sitemap — новый объект попадёт при следующем запросе
        cur.execute(
            f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'"
        )
        _auto_seo(cur, new_id)
        conn.commit()
        _trigger_faq_async(new_id, cur)
        _notify_phone_subscribers(new_id, body, cur)
        _trigger_reindex_async(new_id)
        return _ok({'id': new_id, 'success': True, 'slug': new_slug, 'owner_phone_contact_id': owner_pc_id})

    if method == 'PUT' and rid:
        # Авто-определение района если адрес меняется и район не указан
        if 'address' in body and not (body.get('district') or '').strip():
            address_val = (body.get('address') or '').strip()
            city_val = (body.get('city') or 'Краснодар').strip()
            auto_d = _auto_district(cur, address_val, city_val)
            if auto_d:
                body['district'] = auto_d
        # Нормализация к каноничному названию из справочника
        if body.get('district'):
            body['district'] = _normalize_district(cur, body['district'])

        # ── Снимаем "до" — для diff и истории ─────────────────────────────────
        diff_cols = [
            'title', 'description', 'category', 'deal', 'price', 'price_per_m2',
            'area', 'payback', 'profit', 'floor', 'total_floors', 'rooms',
            'address', 'district', 'city', 'image', 'images', 'tags', 'status',
            'owner_name', 'owner_phone', 'owner_phone2', 'price_unit', 'purpose',
            'condition', 'parking', 'entrance', 'video_url', 'video_type',
            'tenant_name', 'monthly_rent', 'yearly_rent', 'finishing',
            'ceiling_height', 'electricity_kw', 'utilities', 'road_line',
            'is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_visible',
            'use_watermark', 'export_yandex', 'export_avito', 'export_cian',
            'broker_commission', 'broker_id', 'lat', 'lng',
        ]
        cols_sql = ', '.join(diff_cols)
        cur.execute(f"SELECT {cols_sql} FROM {SCHEMA}.listings WHERE id = {int(rid)}")
        before_row = cur.fetchone()
        before = dict(before_row) if before_row else {}

        fields = []
        # Если меняется owner_phone или owner_name — авто-линкуем к phone_contacts
        if 'owner_phone' in body or 'owner_name' in body:
            # Если есть owner_phone в body — берём его, иначе достаём текущий из БД
            new_phone = body.get('owner_phone')
            new_name = body.get('owner_name')
            if new_phone is None or new_name is None:
                cur.execute(f"SELECT owner_phone, owner_name FROM {SCHEMA}.listings WHERE id = {int(rid)}")
                _cur_row = cur.fetchone()
                if _cur_row:
                    if new_phone is None:
                        new_phone = _cur_row['owner_phone']
                    if new_name is None:
                        new_name = _cur_row['owner_name']
            if new_phone:
                pc_id = _upsert_phone_contact(cur, new_phone, new_name, user['id'])
                fields.append(f"owner_phone_contact_id = {pc_id if pc_id else 'NULL'}")
                if pc_id:
                    _link_phone_to_listing(cur, pc_id, int(rid), 'owner')
        if 'owner_phone2' in body:
            new_phone2 = body.get('owner_phone2')
            if new_phone2:
                pc2_id = _upsert_phone_contact(cur, new_phone2, body.get('owner_name'), user['id'])
                fields.append(f"owner_phone2_contact_id = {pc2_id if pc2_id else 'NULL'}")
                if pc2_id:
                    _link_phone_to_listing(cur, pc2_id, int(rid), 'owner')
            else:
                fields.append("owner_phone2_contact_id = NULL")

        # Если изменился title — пересчитываем slug
        if 'title' in body and body.get('title'):
            updated_slug = _make_slug(body['title'], int(rid))
            fields.append(f"slug = '{_safe(updated_slug, 120)}'")

        for f, length in [('title', 255), ('description', 5000), ('category', 50), ('deal', 20),
                          ('address', 255), ('district', 100), ('city', 100), ('image', 500),
                          ('images', 5000), ('tags', 1000), ('status', 20),
                          ('owner_name', 150), ('owner_phone', 30), ('owner_phone2', 30), ('price_unit', 10),
                          ('purpose', 100), ('condition', 50), ('parking', 20), ('entrance', 20),
                          ('video_url', 500), ('video_type', 20), ('tenant_name', 200),
                          ('finishing', 100), ('utilities', 500), ('road_line', 50),
                          # Дополнительные поля из вкладки «Дополнительное»
                          ('building_class', 10), ('property_rights', 30),
                          ('land_status', 30), ('land_vri', 150), ('subway_station', 100),
                          ('cadastral_number', 50)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body.get(f), length)}")
        if 'egrn_objects' in body:
            fields.append(f"egrn_objects = {_jsonb_or_null(body.get('egrn_objects'))}")
        for f in ('price', 'price_per_m2', 'area', 'payback', 'profit', 'floor', 'total_floors',
                  'building_year', 'subway_distance'):
            if f in body:
                fields.append(f"{f} = {_int_or_null(body.get(f))}")
        for f in ('monthly_rent', 'yearly_rent', 'ceiling_height', 'electricity_kw', 'land_area', 'min_area'):
            if f in body:
                fields.append(f"{f} = {_num_or_null(body.get(f))}")
        for f in ('use_watermark', 'export_yandex', 'export_avito', 'export_cian'):
            if f in body:
                fields.append(f"{f} = {_bool(body.get(f))}")
        for f in ('lat', 'lng'):
            if f in body:
                v = body.get(f)
                fields.append(f"{f} = " + ('NULL' if v is None or v == '' else str(float(v))))
        for f in ('is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_visible',
                  'has_furniture', 'has_equipment', 'is_apartments'):
            if f in body:
                fields.append(f"{f} = {_bool(body.get(f))}")
        if 'rooms' in body:
            fields.append(f"rooms = {_int_or_null(body.get('rooms'))}")
        if 'broker_commission' in body:
            fields.append(f"broker_commission = {_str_or_null(body.get('broker_commission'), 100)}")
        if 'broker_id' in body:
            v = body.get('broker_id')
            fields.append(f"broker_id = " + ('NULL' if v is None else str(int(v))))
        if not fields:
            return _err(400, 'Нет полей для обновления')
        # Помечаем как «реально отредактированный человеком из админки»
        fields.append("updated_at = NOW()")
        fields.append("last_edited_at = NOW()")
        if user and user.get('id'):
            fields.append(f"last_edited_by = {int(user['id'])}")
        cur.execute(f"UPDATE {SCHEMA}.listings SET {', '.join(fields)} WHERE id = {int(rid)}")
        # Инвалидируем кэш sitemap если изменился статус или slug
        if 'status' in body or 'title' in body:
            cur.execute(
                f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'"
            )

        # ── Считаем diff и пишем подробную историю ─────────────────────────────
        try:
            cur.execute(f"SELECT {cols_sql} FROM {SCHEMA}.listings WHERE id = {int(rid)}")
            after_row = cur.fetchone()
            after = dict(after_row) if after_row else {}
            diff = {}
            for k in diff_cols:
                ov = before.get(k)
                nv = after.get(k)
                # Нормализуем None и пустые строки
                if ov is None and nv == '':
                    continue
                if nv is None and ov == '':
                    continue
                if ov == nv:
                    continue
                # Для строк сравниваем по содержимому
                if isinstance(ov, str) and isinstance(nv, str) and ov.strip() == nv.strip():
                    continue
                diff[k] = {'old': ov, 'new': nv}
            if diff:
                _write_history(cur, int(rid), user, 'updated', diff)
        except Exception:
            # Не валим основной запрос если diff не получилось снять
            pass

        # Авто-генерация seo_title/seo_description если пустые и изменились ключевые поля
        if any(k in body for k in ('title', 'category', 'deal', 'area', 'price', 'address')):
            _auto_seo(cur, int(rid))
        conn.commit()
        # Перегенерируем FAQ если изменилось описание, название, категория или сделка
        if any(k in body for k in ('title', 'description', 'category', 'deal', 'price', 'area')):
            _trigger_faq_async(int(rid), cur)
        # Обновляем эмбеддинг в ИИ-поиске если изменились характеристики объекта
        if any(k in body for k in ('title', 'description', 'category', 'deal', 'price', 'area',
                                    'address', 'district', 'condition', 'ceiling_height',
                                    'electricity_kw', 'purpose', 'is_visible', 'status')):
            _trigger_reindex_async(int(rid))
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        force = (event.get('queryStringParameters') or {}).get('force') == '1'
        # Брокер может архивировать только свой объект
        if user and user['role'] == 'broker':
            cur.execute(
                f"SELECT broker_id, author_id FROM {SCHEMA}.listings WHERE id = {int(rid)}"
            )
            row = cur.fetchone()
            if not row:
                return _err(404, 'Объект не найден')
            owner_id = row['broker_id'] or row['author_id']
            if owner_id != user['id']:
                return _err(403, 'Вы можете архивировать только свои объекты')
        if force and user and user['role'] == 'admin':
            try:
                _hard_delete_listings(cur, [int(rid)])
            except psycopg2.errors.ForeignKeyViolation as e:
                conn.rollback()
                return _err(409, f'Объект нельзя удалить: на него ссылаются другие записи. {str(e)[:200]}')
            except Exception as e:
                conn.rollback()
                return _err(500, f'Ошибка удаления: {type(e).__name__}: {str(e)[:200]}')
        else:
            cur.execute(f"UPDATE {SCHEMA}.listings SET status = 'archived' WHERE id = {int(rid)}")
        cur.execute(f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _mask_phone(phone: str) -> str:
    """Маскирует телефон: +7 (XXX) XXX-XX-XX → +7 (XXX) ***-**-XX (последние 2 цифры остаются)."""
    if not phone:
        return ''
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return '***'
    return phone[:-7].rstrip() + ' ***-**-' + digits[-2:] if len(phone) > 7 else '***' + digits[-2:]


def _can_see_phone(lead: dict, user: dict) -> bool:
    """Правила видимости телефона клиента в лиде:
    - admin, director, manager, editor, office_manager, broker — видят всегда
    """
    role = user.get('role', '')
    return role in ('admin', 'director', 'manager', 'editor', 'office_manager', 'broker')


def _apply_phone_visibility(lead: dict, user: dict) -> dict:
    """Скрывает телефон в данных лида, если нет прав."""
    if _can_see_phone(lead, user):
        return lead
    masked = dict(lead)
    masked['phone'] = _mask_phone(lead.get('phone') or '')
    masked['phone_hidden'] = True
    return masked


def _leads(cur, conn, method, rid, action, event, user):
    if method == 'GET':
        if rid:
            cur.execute(f"SELECT * FROM {SCHEMA}.leads WHERE id = {int(rid)}")
            lead = cur.fetchone()
            if not lead:
                return _err(404, 'Не найдено')
            cur.execute(
                f"SELECT id, lead_id, user_id, author_name, comment, created_at "
                f"FROM {SCHEMA}.lead_comments WHERE lead_id = {int(rid)} ORDER BY created_at ASC"
            )
            comments = [dict(r) for r in cur.fetchall()]
            lead_dict = _apply_phone_visibility(dict(lead), user)
            return _ok({'lead': lead_dict, 'comments': comments})

        cur.execute(f"SELECT * FROM {SCHEMA}.leads ORDER BY created_at DESC")
        leads_list = [_apply_phone_visibility(dict(r), user) for r in cur.fetchall()]
        return _ok({'leads': leads_list})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'comment' and rid:
        comment = _safe(body.get('comment') or '', 2000)
        if not comment:
            return _err(400, 'Пустой комментарий')
        author = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.lead_comments (lead_id, user_id, author_name, comment) "
            f"VALUES ({int(rid)}, {user['id']}, '{author}', '{comment}')"
        )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        phone = _safe(body.get('phone') or '', 30)
        if not name or not phone:
            return _err(400, 'Имя и телефон обязательны')
        cur.execute(
            f"INSERT INTO {SCHEMA}.leads (name, phone, email, message, listing_id, status, source, "
            f"is_network_tenant, budget, show_on_main, company, lead_type) VALUES ("
            f"'{name}', '{phone}', {_str_or_null(body.get('email'), 100)}, "
            f"{_str_or_null(body.get('message'), 2000)}, {_int_or_null(body.get('listing_id'))}, "
            f"{_str_or_null(body.get('status') or 'new', 20)}, "
            f"{_str_or_null(body.get('source') or 'admin', 50)}, "
            f"{_bool(body.get('is_network_tenant'))}, {_int_or_null(body.get('budget'))}, "
            f"{_bool(body.get('show_on_main', True))}, {_str_or_null(body.get('company'), 200)}, "
            f"{_str_or_null(body.get('lead_type') or 'view', 20)}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('status', 20), ('email', 100), ('message', 2000), ('name', 100),
                          ('phone', 30), ('company', 200), ('source', 50), ('lead_type', 20)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        for f in ('assigned_to', 'listing_id', 'budget', 'broker_id'):
            if f in body:
                fields.append(f"{f} = {_int_or_null(body[f])}")
        for f in ('is_network_tenant', 'show_on_main'):
            if f in body:
                fields.append(f"{f} = {_bool(body[f])}")
        if not fields:
            return _err(400, 'Нет полей')
        # Помечаем заявку как «недавно отредактированную» — для сортировки на сайте
        fields.append('updated_at = NOW()')
        cur.execute(f"UPDATE {SCHEMA}.leads SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        lid = int(rid)
        # 1. Удаляем зависимые записи, чтобы не упасть на FK constraint.
        #    Комментарии — полностью удаляем (теряют смысл без лида).
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.lead_comments WHERE lead_id = {lid}")
        except Exception:
            pass
        # 2. Связи телефонной базы → удаляем (history останется в phone_contact_history).
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.phone_lead_links WHERE lead_id = {lid}")
        except Exception:
            pass
        # 3. CRM-сделки, активности, платежи — обнуляем lead_id,
        #    чтобы сохранить историю сделок даже если лид удалён.
        for tbl in ('crm_deals', 'crm_activities', 'crm_payments', 'crm_events', 'crm_points'):
            try:
                cur.execute(f"UPDATE {SCHEMA}.{tbl} SET lead_id = NULL WHERE lead_id = {lid}")
            except Exception:
                # Таблица может не иметь поля lead_id — это нормально, идём дальше
                pass
        # 4. Удаляем сам лид
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.leads WHERE id = {lid}")
            conn.commit()
            return _ok({'success': True})
        except Exception as e:
            conn.rollback()
            msg = str(e)[:200]
            return _err(409, f'Не удалось удалить заявку — есть связанные данные. {msg}')

    return _err(400, 'Bad request')


def _users(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(
            f"SELECT id, email, name, phone, max_phone, max_user_id, role, avatar, is_active, created_at "
            f"FROM {SCHEMA}.users ORDER BY created_at DESC"
        )
        return _ok({'users': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 150), ('phone', 30), ('max_phone', 30), ('max_user_id', 64), ('role', 20)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'avatar' in body:
            fields.append(f"avatar = {_str_or_null(body['avatar'], 500)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'password' in body and body['password']:
            import hashlib
            h = hashlib.sha256(body['password'].encode()).hexdigest()
            fields.append(f"password_hash = '{h}'")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.users SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        import hashlib
        email = _safe((body.get('email') or '').lower(), 150)
        password = body.get('password') or ''
        name = _safe(body.get('name') or '', 150)
        role = _safe(body.get('role') or 'client', 20)
        if not email or not password or not name:
            return _err(400, 'Заполните email, пароль и имя')
        h = hashlib.sha256(password.encode()).hexdigest()
        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = '{email}'")
        if cur.fetchone():
            return _err(409, 'Email уже используется')
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (email, password_hash, name, role) "
            f"VALUES ('{email}', '{h}', '{name}', '{role}') RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    return _err(400, 'Bad request')


def _pages(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.pages ORDER BY id ASC")
        return _ok({'pages': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('title', 255), ('content', 50000), ('meta_description', 500)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'published' in body:
            fields.append(f"published = {_bool(body['published'])}")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.pages SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        slug = _safe(body.get('slug') or '', 100)
        title = _safe(body.get('title') or '', 255)
        content = _safe(body.get('content') or '', 50000)
        meta = _safe(body.get('meta_description') or '', 500)
        if not slug or not title:
            return _err(400, 'Нужны slug и title')
        cur.execute(
            f"INSERT INTO {SCHEMA}.pages (slug, title, content, meta_description) "
            f"VALUES ('{slug}', '{title}', '{content}', '{meta}') RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    return _err(400, 'Bad request')


def _settings(cur, conn, method, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        s = cur.fetchone()
        return _ok({'settings': dict(s) if s else {}})

    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        fields = []
        for f, length in [('company_name', 255), ('company_phone', 30), ('company_email', 100),
                          ('company_address', 255), ('hero_title', 500), ('hero_subtitle', 1000),
                          ('about_text', 5000), ('logo_url', 500), ('main_city', 100),
                          ('watermark_url', 500), ('watermark_position', 20),
                          ('yandex_metrika_id', 50), ('google_analytics_id', 50),
                          ('yandex_maps_api_key', 200), ('site_url', 255),
                          ('seo_description', 1000), ('seo_keywords', 1000),
                          ('yandex_api_key', 500), ('yandex_folder_id', 100),
                          ('yookassa_shop_id', 100), ('yookassa_secret_key', 500),
                          ('legal_personal_data', 10000), ('legal_privacy_policy', 10000),
                          ('legal_marketing_consent', 10000),
                          ('footer_description', 1000), ('footer_catalog_links', 3000),
                          ('footer_extra_links', 3000), ('footer_legal_info', 2000),
                          # Бренд-кит
                          ('brand_primary_color', 20), ('brand_secondary_color', 20), ('brand_accent_color', 20),
                          ('favicon_url', 500), ('og_image_url', 500), ('apple_touch_icon_url', 500),
                          # Уведомления
                          ('notify_email_recipients', 1000),
                          ('notify_telegram_bot_token', 500), ('notify_telegram_chat_ids', 1000),
                          ('smtp_host', 255), ('smtp_user', 255), ('smtp_password', 500), ('smtp_from', 255),
                          # MAX Bot API
                          ('notify_max_bot_token', 500),
                          ('notify_max_roles', 500), ('notify_max_extra_phones', 1000),
                          # Вебмастер API
                          ('yandex_webmaster_token', 1000),
                          ('yandex_webmaster_user_id', 64),
                          ('google_search_console_key', 10000),
                          # Рекламные пиксели
                          ('vk_pixel_id', 100),
                          ('calltouch_id', 100),
                          ('telegram_ads_pixel', 100),
                          # МАХ автоответ
                          ('max_autoreply_text', 2000),
                          # Ключи проверки безопасности
                          ('zachestny_api_key', 500),
                          ('newdb_api_key', 500),
                          ('bezopasno_api_key', 500)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'company_since_year' in body:
            fields.append(f"company_since_year = {_int_or_null(body['company_since_year'])}")
        if 'watermark_enabled' in body:
            fields.append(f"watermark_enabled = {_bool(body['watermark_enabled'])}")
        if 'watermark_opacity' in body:
            fields.append(f"watermark_opacity = {_int_or_null(body['watermark_opacity'])}")
        if 'smtp_port' in body:
            fields.append(f"smtp_port = {_int_or_null(body['smtp_port'])}")
        for int_field in ('home_listings_limit', 'catalog_page_size', 'news_list_limit',
                          'category_page_size', 'leads_page_size',
                          'home_news_limit', 'home_leads_limit'):
            if int_field in body:
                fields.append(f"{int_field} = {_int_or_null(body[int_field])}")
        for bool_field in ('show_news_on_home', 'show_leads_on_home'):
            if bool_field in body:
                fields.append(f"{bool_field} = {_bool(body[bool_field])}")
        for bf in ('notify_email_enabled', 'notify_email_on_lead', 'notify_email_on_deal', 'notify_email_on_complaint',
                   'notify_telegram_enabled', 'notify_telegram_on_lead', 'notify_telegram_on_deal',
                   'notify_telegram_on_complaint',
                   'notify_max_enabled', 'notify_max_on_lead', 'notify_max_on_deal', 'notify_max_on_complaint',
                   'ya_metrika_goals_enabled', 'max_autoreply_enabled', 'auto_faq_enabled'):
            if bf in body:
                fields.append(f"{bf} = {_bool(body[bf])}")
        if 'role_permissions' in body:
            rp = body['role_permissions']
            rp_json = _safe(json.dumps(rp, ensure_ascii=False), 50000)
            fields.append(f"role_permissions = '{rp_json}'")
        if 'nav_order' in body:
            nav = body['nav_order']
            nav_json = _safe(json.dumps(nav, ensure_ascii=False), 10000)
            fields.append(f"nav_order = '{nav_json}'")
        if 'verification_files' in body:
            vf = body['verification_files']
            if not isinstance(vf, list):
                vf = []
            vf_json = json.dumps(vf, ensure_ascii=False).replace("'", "''")
            fields.append(f"verification_files = '{vf_json}'::jsonb")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.settings SET {', '.join(fields)} WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _vb_retrain_schedule(cur, conn, method, event, user):
    """Управление расписанием автопереобучения ВБ."""
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Только admin и director')

    if method == 'GET':
        cur.execute(
            f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, vb_retrain_sources, "
            f"vb_retrain_last_at, vb_retrain_last_status, vb_retrain_last_saved "
            f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return _ok({'enabled': False, 'hour': 3, 'minute': 0, 'sources': []})
        sources = row.get('vb_retrain_sources') or []
        if isinstance(sources, str):
            try:
                sources = json.loads(sources)
            except Exception:
                sources = []
        return _ok({
            'enabled': row.get('vb_retrain_enabled', False),
            'hour': row.get('vb_retrain_hour', 3),
            'minute': row.get('vb_retrain_minute', 0),
            'sources': sources,
            'last_at': str(row['vb_retrain_last_at']) if row.get('vb_retrain_last_at') else None,
            'last_status': row.get('vb_retrain_last_status'),
            'last_saved': row.get('vb_retrain_last_saved'),
        })

    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        fields = []
        if 'enabled' in body:
            fields.append(f"vb_retrain_enabled = {_bool(body['enabled'])}")
        if 'hour' in body:
            h = max(0, min(23, int(body['hour'] or 3)))
            fields.append(f"vb_retrain_hour = {h}")
        if 'minute' in body:
            m = max(0, min(59, int(body['minute'] or 0)))
            fields.append(f"vb_retrain_minute = {m}")
        if 'sources' in body:
            sources_json = json.dumps(body['sources'], ensure_ascii=False).replace("'", "''")
            fields.append(f"vb_retrain_sources = '{sources_json}'::jsonb")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET {', '.join(fields)} "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
        )
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _notifications(cur, conn, method, action, event, user):
    """Тестовая отправка уведомлений: email и telegram."""
    if method != 'POST' or action != 'test':
        return _err(400, 'Bad request')
    body = json.loads(event.get('body') or '{}')
    channel = body.get('channel')
    # Загружаем настройки
    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    s = cur.fetchone()
    if not s:
        return _err(400, 'Настройки не найдены')

    if channel == 'telegram':
        token = (s.get('notify_telegram_bot_token') or '').strip()
        chats = (s.get('notify_telegram_chat_ids') or '').strip()
        if not token or not chats:
            return _err(400, 'Заполните токен бота и Chat ID')
        try:
            import urllib.request
            import urllib.parse
            chat_ids = [c.strip() for c in chats.split(',') if c.strip()]
            sent = 0
            errors = []
            for cid in chat_ids:
                try:
                    text = f"🧪 Тестовое сообщение от {s.get('company_name') or 'админ-панели'}.\nЕсли вы видите этот текст — уведомления настроены правильно."
                    data = urllib.parse.urlencode({'chat_id': cid, 'text': text}).encode()
                    req_url = f"https://api.telegram.org/bot{token}/sendMessage"
                    with urllib.request.urlopen(req_url, data=data, timeout=10) as r:
                        if r.status == 200:
                            sent += 1
                        else:
                            errors.append(f"chat {cid}: HTTP {r.status}")
                except Exception as ex:
                    errors.append(f"chat {cid}: {str(ex)[:100]}")
            if sent == 0:
                return _err(400, 'Не удалось отправить: ' + '; '.join(errors))
            return _ok({'success': True, 'message': f'Отправлено в {sent} чат(ов)', 'errors': errors})
        except Exception as ex:
            return _err(500, f'Ошибка Telegram: {str(ex)[:200]}')

    if channel == 'email':
        recipients = (s.get('notify_email_recipients') or '').strip()
        host = (s.get('smtp_host') or '').strip()
        port = s.get('smtp_port') or 465
        smtp_user = (s.get('smtp_user') or '').strip()
        smtp_pass = s.get('smtp_password') or ''
        smtp_from = (s.get('smtp_from') or smtp_user or '').strip()
        if not recipients:
            return _err(400, 'Не указаны получатели')
        if not host or not smtp_user or not smtp_pass:
            return _err(400, 'Заполните SMTP-сервер, логин и пароль')
        try:
            import smtplib
            from email.mime.text import MIMEText
            to_list = [r.strip() for r in recipients.split(',') if r.strip()]
            msg = MIMEText(f'Это тестовое письмо от {s.get("company_name") or "админ-панели"}.\n\nЕсли вы видите этот текст — уведомления настроены правильно.', 'plain', 'utf-8')
            msg['Subject'] = 'Тестовое уведомление'
            msg['From'] = smtp_from
            msg['To'] = ', '.join(to_list)
            if int(port) == 465:
                server = smtplib.SMTP_SSL(host, int(port), timeout=15)
            else:
                server = smtplib.SMTP(host, int(port), timeout=15)
                server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, to_list, msg.as_string())
            server.quit()
            return _ok({'success': True, 'message': f'Письмо отправлено на {len(to_list)} адрес(а)'})
        except Exception as ex:
            return _err(500, f'SMTP-ошибка: {str(ex)[:200]}')

    if channel == 'max':
        import urllib.request as _ureq
        bot_token = (s.get('notify_max_bot_token') or '').strip()
        if not bot_token:
            return _err(400, 'Укажите токен MAX-бота в разделе Интеграции → MAX')
        # Собираем user_id из users по ролям
        enabled_roles_str = (s.get('notify_max_roles') or 'broker,admin,director,office_manager').strip()
        enabled_roles = [r.strip() for r in enabled_roles_str.split(',') if r.strip()]
        roles_sql = ', '.join(f"'{r}'" for r in enabled_roles)
        cur.execute(
            f"SELECT name, max_user_id FROM {SCHEMA}.users "
            f"WHERE is_active = TRUE AND max_user_id IS NOT NULL AND max_user_id != '' "
            f"AND role IN ({roles_sql})"
        )
        recipients = [(row['name'], row['max_user_id']) for row in cur.fetchall()]
        extra_raw = (s.get('notify_max_extra_phones') or '').strip()
        for i, uid in enumerate([u.strip() for u in extra_raw.split(',') if u.strip()]):
            recipients.append((f'Доп. получатель {i+1}', uid))
        if not recipients:
            return _err(400, 'Нет получателей. Укажите MAX User ID у сотрудников или добавьте дополнительные ID.')
        company = s.get('company_name') or 'Система'
        text = f'🧪 Тест от {company}. Уведомления MAX работают!'
        base_url = 'https://botapi.max.ru'
        sent, errors = 0, []
        for uname, user_id in recipients:
            try:
                import json as _json
                payload = _json.dumps({'text': text}, ensure_ascii=False).encode('utf-8')
                req = _ureq.Request(
                    f'{base_url}/messages?user_id={user_id}',
                    data=payload,
                    headers={'Authorization': bot_token, 'Content-Type': 'application/json'},
                    method='POST',
                )
                with _ureq.urlopen(req, timeout=8) as r:
                    if r.status == 200:
                        sent += 1
                    else:
                        errors.append(f'{uname}: HTTP {r.status}')
            except Exception as ex:
                errors.append(f'{uname}: {str(ex)[:80]}')
        if sent == 0:
            return _ok({'success': False, 'message': f'Не отправлено. {"; ".join(errors[:3])}'})
        return _ok({'success': True, 'message': f'Отправлено {sent} из {len(recipients)} получателей', 'errors': errors})

    return _err(400, 'Неизвестный канал')


def _webmaster_check(cur, method, action, event, user):
    """Проверка токенов и отправка sitemap в Яндекс Вебмастер и Google Search Console."""
    import urllib.request as _ureq
    import json as _json

    if method not in ('POST', 'GET'):
        return _err(405, 'Method not allowed')

    cur.execute(f"SELECT * FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    s = cur.fetchone()
    if not s:
        return _err(400, 'Настройки не найдены')

    site_url = (s.get('site_url') or 'https://bmn.su').rstrip('/')
    sitemap_url = site_url + '/sitemap.xml'

    # ── Яндекс Вебмастер ──────────────────────────────────────────────────
    if action == 'yandex_check':
        token = (s.get('yandex_webmaster_token') or '').strip()
        if not token:
            return _err(400, 'Укажите OAuth-токен Яндекс Вебмастера')
        try:
            # Получаем список сайтов пользователя
            req = _ureq.Request(
                'https://api.webmaster.yandex.net/v4/user',
                headers={'Authorization': f'OAuth {token}', 'Accept': 'application/json'},
            )
            with _ureq.urlopen(req, timeout=10) as r:
                data = _json.loads(r.read().decode())
            user_id = data.get('user_id')
            if not user_id:
                return _err(400, f'Не удалось получить user_id: {str(data)[:200]}')
            return _ok({'success': True, 'user_id': str(user_id), 'message': f'Токен действителен, user_id: {user_id}'})
        except Exception as ex:
            return _err(400, f'Ошибка Яндекс API: {str(ex)[:200]}')

    if action == 'yandex_sites':
        token = (s.get('yandex_webmaster_token') or '').strip()
        user_id = (s.get('yandex_webmaster_user_id') or '').strip()
        if not token or not user_id:
            return _err(400, 'Укажите токен и user_id')
        try:
            req = _ureq.Request(
                f'https://api.webmaster.yandex.net/v4/user/{user_id}/hosts',
                headers={'Authorization': f'OAuth {token}', 'Accept': 'application/json'},
            )
            with _ureq.urlopen(req, timeout=10) as r:
                data = _json.loads(r.read().decode())
            hosts = data.get('hosts', [])
            return _ok({'success': True, 'hosts': hosts})
        except Exception as ex:
            return _err(400, f'Ошибка получения сайтов: {str(ex)[:200]}')

    if action == 'yandex_submit':
        token = (s.get('yandex_webmaster_token') or '').strip()
        user_id = (s.get('yandex_webmaster_user_id') or '').strip()
        if not token or not user_id:
            return _err(400, 'Укажите токен и user_id (получите через «Проверить токен»)')
        try:
            # Ищем host_id для нашего сайта
            req = _ureq.Request(
                f'https://api.webmaster.yandex.net/v4/user/{user_id}/hosts',
                headers={'Authorization': f'OAuth {token}', 'Accept': 'application/json'},
            )
            with _ureq.urlopen(req, timeout=10) as r:
                hosts_data = _json.loads(r.read().decode())
            hosts = hosts_data.get('hosts', [])
            host_id = None
            for h in hosts:
                host_url = (h.get('unicode_host_url') or h.get('host_url') or '').rstrip('/')
                if site_url in host_url or host_url in site_url:
                    host_id = h.get('host_id')
                    break
            if not host_id and hosts:
                host_id = hosts[0].get('host_id')
            if not host_id:
                return _err(400, f'Сайт {site_url} не найден в Яндекс Вебмастере. Сначала добавьте и подтвердите сайт.')
            # Отправляем sitemap
            payload = _json.dumps({'url': sitemap_url}).encode('utf-8')
            req2 = _ureq.Request(
                f'https://api.webmaster.yandex.net/v4/user/{user_id}/hosts/{host_id}/sitemaps',
                data=payload,
                headers={
                    'Authorization': f'OAuth {token}',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                method='POST',
            )
            with _ureq.urlopen(req2, timeout=10) as r2:
                resp = _json.loads(r2.read().decode())
            return _ok({'success': True, 'message': f'Sitemap {sitemap_url} отправлен в Яндекс Вебмастер', 'response': resp})
        except Exception as ex:
            return _err(400, f'Ошибка отправки sitemap в Яндекс: {str(ex)[:300]}')

    # ── Google Search Console ──────────────────────────────────────────────
    if action == 'google_check':
        key_json = (s.get('google_search_console_key') or '').strip()
        if not key_json:
            return _err(400, 'Укажите JSON-ключ сервисного аккаунта Google')
        try:
            key_data = _json.loads(key_json)
            client_email = key_data.get('client_email', '')
            project_id = key_data.get('project_id', '')
            if not client_email:
                return _err(400, 'Неверный формат JSON: нет поля client_email')
            return _ok({'success': True, 'client_email': client_email, 'project_id': project_id,
                        'message': f'JSON-ключ корректен: {client_email}'})
        except _json.JSONDecodeError:
            return _err(400, 'Неверный JSON. Вставьте содержимое файла credentials.json полностью.')
        except Exception as ex:
            return _err(400, f'Ошибка проверки: {str(ex)[:200]}')

    if action == 'google_submit':
        key_json = (s.get('google_search_console_key') or '').strip()
        if not key_json:
            return _err(400, 'Укажите JSON-ключ сервисного аккаунта Google')
        try:
            import time, base64, hashlib, hmac
            key_data = _json.loads(key_json)
            client_email = key_data['client_email']
            private_key_pem = key_data['private_key']

            # Получаем access_token через JWT (service account)
            try:
                from cryptography.hazmat.primitives import hashes, serialization
                from cryptography.hazmat.primitives.asymmetric import padding
                from cryptography.hazmat.backends import default_backend
            except ImportError:
                return _err(500, 'Библиотека cryptography не установлена. Добавьте в requirements.txt.')

            now = int(time.time())
            header = base64.urlsafe_b64encode(_json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode()).rstrip(b'=')
            payload_jwt = base64.urlsafe_b64encode(_json.dumps({
                'iss': client_email,
                'scope': 'https://www.googleapis.com/auth/webmasters',
                'aud': 'https://oauth2.googleapis.com/token',
                'exp': now + 3600,
                'iat': now,
            }).encode()).rstrip(b'=')
            msg = header + b'.' + payload_jwt
            private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None, backend=default_backend())
            signature = base64.urlsafe_b64encode(private_key.sign(msg, padding.PKCS1v15(), hashes.SHA256())).rstrip(b'=')
            jwt_token = (msg + b'.' + signature).decode()

            # Обмениваем JWT на access_token
            token_data = _json.dumps({
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': jwt_token,
            }).encode()
            token_req = _ureq.Request(
                'https://oauth2.googleapis.com/token',
                data=token_data,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with _ureq.urlopen(token_req, timeout=10) as tr:
                token_resp = _json.loads(tr.read().decode())
            access_token = token_resp.get('access_token')
            if not access_token:
                return _err(400, f'Не удалось получить access_token: {str(token_resp)[:200]}')

            # Отправляем sitemap в Google Search Console
            submit_req = _ureq.Request(
                f'https://searchconsole.googleapis.com/webmasters/v3/sites/{_ureq.quote(site_url + "/", safe="")}/sitemaps/{_ureq.quote(sitemap_url, safe="")}',
                data=b'',
                headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'},
                method='PUT',
            )
            with _ureq.urlopen(submit_req, timeout=10) as sr:
                status_code = sr.status
            return _ok({'success': True, 'message': f'Sitemap {sitemap_url} отправлен в Google Search Console (HTTP {status_code})'})
        except Exception as ex:
            return _err(400, f'Ошибка Google API: {str(ex)[:300]}')

    return _err(400, 'Неизвестное действие')


def _role_permissions(cur, conn, method, event, user, permissions):
    """CRUD для настроек прав ролей"""
    if user['role'] != 'admin':
        return _err(403, 'Только администратор может управлять правами')
    if method == 'GET':
        return _ok({'permissions': permissions or {}})
    if method == 'PUT':
        body = json.loads(event.get('body') or '{}')
        new_perms = body.get('permissions', {})
        rp_json = _safe(json.dumps(new_perms, ensure_ascii=False), 50000)
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET role_permissions = '{rp_json}', updated_at = NOW() "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
        )
        conn.commit()
        return _ok({'success': True})
    return _err(400, 'Bad request')


def _cities(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.cities ORDER BY sort_order ASC, name ASC")
        return _ok({'cities': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        region = _safe(body.get('region') or '', 150)
        if not name:
            return _err(400, 'Название обязательно')
        cur.execute(f"SELECT id FROM {SCHEMA}.cities WHERE name = '{name}'")
        if cur.fetchone():
            return _err(409, 'Город уже добавлен')
        region_s = "NULL" if not region else f"'{region}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.cities (name, region) VALUES ('{name}', {region_s}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('region', 150)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.cities SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"UPDATE {SCHEMA}.cities SET is_active = FALSE WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _purposes(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.purposes ORDER BY sort_order ASC, name ASC")
        return _ok({'purposes': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        slug = _safe(body.get('slug') or '', 50)
        icon = _safe(body.get('icon') or '', 50)
        if not name or not slug:
            return _err(400, 'Название и slug обязательны')
        cur.execute(f"SELECT id FROM {SCHEMA}.purposes WHERE slug = '{slug}' OR name = '{name}'")
        if cur.fetchone():
            return _err(409, 'Назначение уже существует')
        icon_s = "NULL" if not icon else f"'{icon}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.purposes (name, slug, icon) VALUES ('{name}', '{slug}', {icon_s}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('slug', 50), ('icon', 50)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.purposes SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.purposes WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _land_vri(cur, conn, method, rid, event, user):
    """Справочник видов разрешённого использования (ВРИ) земельных участков."""
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.land_vri ORDER BY sort_order ASC, name ASC")
        return _ok({'land_vri': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 150)
        slug = _safe(body.get('slug') or '', 60)
        if not name or not slug:
            return _err(400, 'Название и slug обязательны')
        cur.execute(f"SELECT id FROM {SCHEMA}.land_vri WHERE slug = '{slug}' OR name = '{name}'")
        if cur.fetchone():
            return _err(409, 'ВРИ уже существует')
        cur.execute(
            f"INSERT INTO {SCHEMA}.land_vri (name, slug) VALUES ('{name}', '{slug}') RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 150), ('slug', 60)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.land_vri SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.land_vri WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _districts(cur, conn, method, rid, event, user):
    """Справочник районов города."""
    if method == 'GET':
        cur.execute(
            f"SELECT d.*, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.listings l "
            f" WHERE l.status='active' AND l.district ILIKE '%' || d.name || '%') AS listings_count "
            f"FROM {SCHEMA}.districts d ORDER BY d.sort_order ASC, d.name ASC"
        )
        return _ok({'districts': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        slug = _safe(body.get('slug') or '', 100)
        city = _safe(body.get('city') or 'Краснодар', 100)
        description = _safe(body.get('description') or '', 1000)
        sort_order = int(body.get('sort_order') or 100)
        if not name:
            return _err(400, 'Название обязательно')
        if not slug:
            import re as _re
            slug = _re.sub(r'[^a-z0-9]+', '-', name.lower().replace('ё', 'e')
                .replace('а','a').replace('б','b').replace('в','v').replace('г','g')
                .replace('д','d').replace('е','e').replace('ж','zh').replace('з','z')
                .replace('и','i').replace('й','y').replace('к','k').replace('л','l')
                .replace('м','m').replace('н','n').replace('о','o').replace('п','p')
                .replace('р','r').replace('с','s').replace('т','t').replace('у','u')
                .replace('ф','f').replace('х','kh').replace('ц','ts').replace('ч','ch')
                .replace('ш','sh').replace('щ','sch').replace('ъ','').replace('ы','y')
                .replace('ь','').replace('э','e').replace('ю','yu').replace('я','ya')
            ).strip('-')
        cur.execute(f"SELECT id FROM {SCHEMA}.districts WHERE slug = '{slug}'")
        if cur.fetchone():
            return _err(409, f"Район со slug «{slug}» уже существует")
        desc_val = f"'{description}'" if description else 'NULL'
        cur.execute(
            f"INSERT INTO {SCHEMA}.districts (name, slug, city, description, sort_order) "
            f"VALUES ('{name}', '{slug}', '{city}', {desc_val}, {sort_order}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('slug', 100), ('city', 100), ('description', 1000)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if 'sort_order' in body:
            fields.append(f"sort_order = {_int_or_null(body['sort_order'])}")
        if 'parent_id' in body:
            fields.append(f"parent_id = {_int_or_null(body['parent_id'])}")
        if not fields:
            return _err(400, 'Нет полей для обновления')
        cur.execute(
            f"UPDATE {SCHEMA}.districts SET {', '.join(fields)} WHERE id = {int(rid)}"
        )
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.districts WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _xml_feeds(cur, conn, method, rid, event, user):
    if method == 'GET':
        cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds ORDER BY id ASC")
        return _ok({'feeds': [dict(r) for r in cur.fetchall()]})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 100)
        platform = _safe(body.get('platform') or '', 50)
        feed_type = _safe(body.get('feed_type') or 'export', 20)
        url = _safe(body.get('url') or '', 500)
        if not name or not platform:
            return _err(400, 'Название и платформа обязательны')
        url_s = "NULL" if not url else f"'{url}'"
        cur.execute(
            f"INSERT INTO {SCHEMA}.xml_feeds (name, platform, feed_type, url) "
            f"VALUES ('{name}', '{platform}', '{feed_type}', {url_s}) RETURNING id"
        )
        conn.commit()
        return _ok({'id': cur.fetchone()['id'], 'success': True})

    if method == 'PUT' and rid:
        fields = []
        for f, length in [('name', 100), ('platform', 50), ('feed_type', 20), ('url', 500)]:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body['is_active'])}")
        if not fields:
            return _err(400, 'Нет полей')
        cur.execute(f"UPDATE {SCHEMA}.xml_feeds SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"DELETE FROM {SCHEMA}.xml_feeds WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _stats(cur):
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active'")
    listings_active = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads")
    leads_total = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE status = 'new'")
    leads_new = cur.fetchone()['c']
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.users")
    users_total = cur.fetchone()['c']
    cur.execute(f"SELECT category, COUNT(*) AS c FROM {SCHEMA}.listings WHERE status = 'active' GROUP BY category")
    by_cat = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT status, COUNT(*) AS c FROM {SCHEMA}.leads GROUP BY status")
    by_status = [dict(r) for r in cur.fetchall()]
    return _ok({
        'listings_active': listings_active,
        'leads_total': leads_total,
        'leads_new': leads_new,
        'users_total': users_total,
        'by_category': by_cat,
        'leads_by_status': by_status,
    })


def _listing_history(cur, method, rid, event, user):
    if method == 'GET' and rid:
        cur.execute(
            f"SELECT lh.id, lh.listing_id, lh.user_id, lh.user_name, lh.action, lh.changes, lh.created_at "
            f"FROM {SCHEMA}.listing_history lh "
            f"WHERE lh.listing_id = {int(rid)} ORDER BY lh.created_at DESC LIMIT 100"
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            if d.get('created_at'):
                d['created_at'] = d['created_at'].isoformat()
            rows.append(d)
        return _ok({'history': rows})
    if method == 'POST' and rid:
        body = json.loads(event.get('body') or '{}')
        action = _safe(body.get('action') or 'updated', 50)
        changes = json.dumps(body.get('changes') or {}, ensure_ascii=False)
        user_name = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_history (listing_id, user_id, user_name, action, changes) "
            f"VALUES ({int(rid)}, {user['id']}, '{user_name}', '{action}', '{changes}')"
        )
        return _ok({'success': True})
    return _err(400, 'Bad request')


def _listing_stats(cur, rid):
    if not rid:
        return _err(400, 'id обязателен')
    lid = int(rid)
    cur.execute(
        f"SELECT COUNT(*) AS total FROM {SCHEMA}.listing_views WHERE listing_id = {lid}"
    )
    total_views = cur.fetchone()['total']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.listing_views "
        f"WHERE listing_id = {lid} AND viewed_at >= NOW() - INTERVAL '30 days'"
    )
    views_30d = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.listing_views "
        f"WHERE listing_id = {lid} AND viewed_at >= NOW() - INTERVAL '7 days'"
    )
    views_7d = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads WHERE listing_id = {lid}"
    )
    leads_total = cur.fetchone()['c']
    cur.execute(
        f"SELECT COUNT(*) AS c FROM {SCHEMA}.leads "
        f"WHERE listing_id = {lid} AND created_at >= NOW() - INTERVAL '30 days'"
    )
    leads_30d = cur.fetchone()['c']
    cur.execute(
        f"SELECT stat_date::text, views_count, leads_count FROM {SCHEMA}.listing_stats_daily "
        f"WHERE listing_id = {lid} ORDER BY stat_date DESC LIMIT 30"
    )
    daily = [dict(r) for r in cur.fetchall()]
    return _ok({
        'total_views': total_views,
        'views_30d': views_30d,
        'views_7d': views_7d,
        'leads_total': leads_total,
        'leads_30d': leads_30d,
        'daily': daily,
    })


def _hard_delete_listings(cur, ids: list):
    """Полное удаление объектов вместе со всеми зависимыми записями.
    Бросает psycopg2.errors.ForeignKeyViolation если есть незачищенные связи (например crm_deals)."""
    if not ids:
        return
    ids_sql = ', '.join(str(int(i)) for i in ids if str(i).isdigit())
    if not ids_sql:
        return
    # Дочерние таблицы — удаляем в порядке зависимости
    dependent_tables = [
        'listing_history',
        'listing_views',
        'listing_stats',
        'listing_stats_daily',
        'phone_listing_links',
        'listing_comments',
        'listing_documents',
        'crm_owner_listings',
    ]
    for tbl in dependent_tables:
        try:
            cur.execute(f"DELETE FROM {SCHEMA}.{tbl} WHERE listing_id IN ({ids_sql})")
        except psycopg2.errors.UndefinedTable:
            # Таблицы может не быть — пропускаем
            continue
    # Для crm_deals и crm_payments listing_id nullable — обнуляем, чтобы сохранить историю сделок
    for tbl in ('crm_deals', 'crm_payments'):
        try:
            cur.execute(f"UPDATE {SCHEMA}.{tbl} SET listing_id = NULL WHERE listing_id IN ({ids_sql})")
        except psycopg2.errors.UndefinedTable:
            continue
        except Exception:
            # Если колонка NOT NULL — придётся удалить
            try:
                cur.execute(f"DELETE FROM {SCHEMA}.{tbl} WHERE listing_id IN ({ids_sql})")
            except Exception:
                pass
    cur.execute(f"DELETE FROM {SCHEMA}.listings WHERE id IN ({ids_sql})")


def _listings_bulk(cur, conn, event, user):
    body = json.loads(event.get('body') or '{}')
    ids = [int(i) for i in (body.get('ids') or []) if str(i).isdigit()]
    op = body.get('op')
    if not ids or not op:
        return _err(400, 'ids и op обязательны')
    ids_sql = ', '.join(str(i) for i in ids)
    if op == 'archive':
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET status = 'archived', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
        for lid in ids:
            _write_history(cur, lid, user, 'archived', {})
        cur.execute(f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'")
    elif op == 'activate':
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET status = 'active', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
        for lid in ids:
            _write_history(cur, lid, user, 'restored', {})
        cur.execute(f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'")
    elif op == 'set_hot':
        val = _bool(body.get('value', True))
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET is_hot = {val}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_new':
        val = _bool(body.get('value', True))
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET is_new = {val}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'delete':
        if user['role'] != 'admin':
            return _err(403, 'Только администратор может удалять объекты')
        try:
            _hard_delete_listings(cur, ids)
        except psycopg2.errors.ForeignKeyViolation as e:
            conn.rollback()
            return _err(409, f'Не удалось удалить — на объекты ссылаются связанные записи. {str(e)[:200]}')
        except Exception as e:
            conn.rollback()
            return _err(500, f'Ошибка удаления: {type(e).__name__}: {str(e)[:200]}')
    elif op == 'set_category':
        cat = _safe(body.get('value') or '', 50)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET category = '{cat}', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_city':
        city = _safe(body.get('value') or '', 100)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET city = '{city}', updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    elif op == 'set_broker':
        # Назначить брокера группе объектов — только админ/директор
        if user['role'] not in ('admin', 'director'):
            return _err(403, 'Только администратор или директор может передавать объекты')
        new_broker_id = body.get('value')
        if new_broker_id is None or new_broker_id == '':
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET broker_id = NULL, updated_at = NOW() "
                f"WHERE id IN ({ids_sql})"
            )
        else:
            try:
                bid = int(new_broker_id)
            except Exception:
                return _err(400, 'Некорректный id брокера')
            # Проверяем, что такой пользователь существует и активен
            cur.execute(
                f"SELECT id, name FROM {SCHEMA}.users "
                f"WHERE id = {bid} AND is_active = TRUE"
            )
            target = cur.fetchone()
            if not target:
                return _err(404, 'Брокер не найден или отключён')
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET broker_id = {bid}, updated_at = NOW() "
                f"WHERE id IN ({ids_sql})"
            )
            for lid in ids:
                _write_history(cur, lid, user, 'broker_changed', {'broker_id': bid, 'broker_name': target['name']})
    elif op == 'set_visible':
        val = _bool(body.get('value', True))
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET is_visible = {val}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
        action_label = 'shown' if body.get('value', True) else 'hidden'
        for lid in ids:
            _write_history(cur, lid, user, action_label, {'is_visible': body.get('value', True)})
        cur.execute(f"UPDATE {SCHEMA}.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap'")
    elif op == 'set_export':
        # Установить/снять флаги экспорта в XML-фиды: value = {'platform': 'yandex'|'avito'|'cian'|'all', 'enabled': bool}
        val = body.get('value') or {}
        platform = str(val.get('platform') or '').lower()
        enabled = bool(val.get('enabled', True))
        enabled_sql = 'TRUE' if enabled else 'FALSE'
        allowed = {'yandex': 'export_yandex', 'avito': 'export_avito', 'cian': 'export_cian'}
        if platform == 'all':
            fields_sql = ', '.join(f"{col} = {enabled_sql}" for col in allowed.values())
        elif platform in allowed:
            fields_sql = f"{allowed[platform]} = {enabled_sql}"
        else:
            return _err(400, f'Неизвестная платформа: {platform}')
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET {fields_sql}, updated_at = NOW() WHERE id IN ({ids_sql})"
        )
    else:
        return _err(400, f'Неизвестная операция: {op}')
    conn.commit()
    return _ok({'success': True, 'affected': len(ids)})


def _write_history(cur, listing_id, user, action, changes):
    user_name = _safe(user['name'], 150)
    changes_json = json.dumps(changes, ensure_ascii=False, default=str).replace("'", "''")
    # Защита: ограничим длину JSON в логе истории
    if len(changes_json) > 20000:
        changes_json = changes_json[:20000]
    cur.execute(
        f"INSERT INTO {SCHEMA}.listing_history (listing_id, user_id, user_name, action, changes) "
        f"VALUES ({listing_id}, {user['id']}, '{user_name}', '{action}', '{changes_json}')"
    )


def _normalize_phone(phone):
    import re
    digits = re.sub(r'\D', '', phone or '')
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _upsert_phone_contact(cur, phone, name=None, user_id=None):
    """
    Находит или создаёт запись в phone_contacts по нормализованному номеру.
    Возвращает id записи или None если телефон пустой.
    Эта функция — единый источник истины для всех собственников / контактов.
    """
    if not phone:
        return None
    norm = _normalize_phone(phone)
    if not norm:
        return None
    cur.execute(
        f"SELECT id, name FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}' LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        pid = row['id'] if isinstance(row, dict) else row[0]
        existing_name = row['name'] if isinstance(row, dict) else row[1]
        # Обновляем имя, если оно было пустое
        if (not existing_name or not str(existing_name).strip()) and name and str(name).strip():
            safe_name = _safe(name, 200)
            cur.execute(
                f"UPDATE {SCHEMA}.phone_contacts SET name = '{safe_name}', updated_at = NOW() WHERE id = {pid}"
            )
        return pid
    # Создаём новую запись
    safe_phone = _safe(phone, 30)
    safe_name = _safe(name, 200) if name else ''
    name_sql = f"'{safe_name}'" if safe_name else 'NULL'
    user_sql = str(int(user_id)) if user_id else 'NULL'
    cur.execute(
        f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, created_by) "
        f"VALUES ('{safe_phone}', '{norm}', {name_sql}, {user_sql}) RETURNING id"
    )
    new_row = cur.fetchone()
    return new_row['id'] if isinstance(new_row, dict) else new_row[0]


def _link_phone_to_listing(cur, phone_contact_id, listing_id, role='owner'):
    """Создаёт связь phone_listing_links (если её ещё нет)."""
    if not phone_contact_id or not listing_id:
        return
    cur.execute(
        f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
        f"VALUES ({int(phone_contact_id)}, {int(listing_id)}, '{_safe(role, 50)}') "
        f"ON CONFLICT (phone_contact_id, listing_id) DO NOTHING"
    )


def _phones(cur, conn, method, rid, action, event, user):
    if method == 'GET':
        if action == 'search':
            params = event.get('queryStringParameters') or {}
            q = _safe(params.get('q') or '', 100)
            q_norm = _normalize_phone(q)
            cur.execute(
                f"SELECT pc.*, "
                f"  (SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'status', l.status, 'role', pll.role)) "
                f"   FROM {SCHEMA}.phone_listing_links pll JOIN {SCHEMA}.listings l ON l.id = pll.listing_id "
                f"   WHERE pll.phone_contact_id = pc.id) AS linked_listings, "
                f"  (SELECT json_agg(json_build_object('id', ld.id, 'name', ld.name, 'status', ld.status, 'created_at', ld.created_at)) "
                f"   FROM {SCHEMA}.phone_lead_links pldl JOIN {SCHEMA}.leads ld ON ld.id = pldl.lead_id "
                f"   WHERE pldl.phone_contact_id = pc.id) AS linked_leads "
                f"FROM {SCHEMA}.phone_contacts pc "
                f"WHERE pc.phone_normalized LIKE '%{q_norm}%' OR pc.name ILIKE '%{_safe(q, 100)}%' "
                f"ORDER BY pc.updated_at DESC LIMIT 50"
            )
            rows = [_ser_phone(dict(r)) for r in cur.fetchall()]
            return _ok({'contacts': rows})

        if rid and action == 'history':
            cur.execute(
                f"SELECT pch.*, u.name AS changed_by_name "
                f"FROM {SCHEMA}.phone_contact_history pch "
                f"LEFT JOIN {SCHEMA}.users u ON u.id = pch.changed_by "
                f"WHERE pch.phone_contact_id = {int(rid)} "
                f"ORDER BY pch.changed_at DESC LIMIT 100"
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                d['changed_at'] = d['changed_at'].isoformat() if d.get('changed_at') else None
                rows.append(d)
            return _ok({'history': rows})

        if rid:
            cur.execute(
                f"SELECT pc.*, "
                f"  (SELECT json_agg(json_build_object('id', l.id, 'title', l.title, 'status', l.status, 'role', pll.role, 'image', l.image)) "
                f"   FROM {SCHEMA}.phone_listing_links pll JOIN {SCHEMA}.listings l ON l.id = pll.listing_id "
                f"   WHERE pll.phone_contact_id = pc.id) AS linked_listings, "
                f"  (SELECT json_agg(json_build_object('id', ld.id, 'name', ld.name, 'status', ld.status, 'created_at', ld.created_at)) "
                f"   FROM {SCHEMA}.phone_lead_links pldl JOIN {SCHEMA}.leads ld ON ld.id = pldl.lead_id "
                f"   WHERE pldl.phone_contact_id = pc.id) AS linked_leads "
                f"FROM {SCHEMA}.phone_contacts pc WHERE pc.id = {int(rid)}"
            )
            row = cur.fetchone()
            if not row:
                return _err(404, 'Не найдено')
            return _ok({'contact': _ser_phone(dict(row))})

        params = event.get('queryStringParameters') or {}
        page = max(1, int(params.get('page') or 1))
        limit = 50
        offset = (page - 1) * limit
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.phone_contacts")
        total = cur.fetchone()['c']
        cur.execute(
            f"SELECT pc.id, pc.phone, pc.phone_normalized, pc.name, pc.company, pc.notes, pc.tags, pc.created_at, pc.updated_at, "
            f"  (SELECT COUNT(*) FROM {SCHEMA}.phone_listing_links WHERE phone_contact_id = pc.id) AS listings_count, "
            f"  (SELECT COUNT(*) FROM {SCHEMA}.phone_lead_links WHERE phone_contact_id = pc.id) AS leads_count "
            f"FROM {SCHEMA}.phone_contacts pc ORDER BY pc.updated_at DESC LIMIT {limit} OFFSET {offset}"
        )
        rows = [_ser_phone(dict(r)) for r in cur.fetchall()]
        return _ok({'contacts': rows, 'total': total, 'page': page, 'pages': (total + limit - 1) // limit})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST' and action == 'sync':
        synced = _sync_phones(cur, conn)
        return _ok({'success': True, 'synced': synced})

    if method == 'POST' and action == 'link':
        cid = int(rid)
        listing_id = body.get('listing_id')
        lead_id = body.get('lead_id')
        role = _safe(body.get('role') or 'owner', 50)
        if listing_id:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
                f"VALUES ({cid}, {int(listing_id)}, '{role}') ON CONFLICT DO NOTHING"
            )
        if lead_id:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_lead_links (phone_contact_id, lead_id) "
                f"VALUES ({cid}, {int(lead_id)}) ON CONFLICT DO NOTHING"
            )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST' and action == 'unlink':
        cid = int(rid)
        listing_id = body.get('listing_id')
        lead_id = body.get('lead_id')
        if listing_id:
            cur.execute(
                f"UPDATE {SCHEMA}.phone_listing_links SET role = role "
                f"WHERE phone_contact_id = {cid} AND listing_id = {int(listing_id)}"
            )
            cur.execute(
                f"DELETE FROM {SCHEMA}.phone_listing_links "
                f"WHERE phone_contact_id = {cid} AND listing_id = {int(listing_id)}"
            )
        if lead_id:
            cur.execute(
                f"DELETE FROM {SCHEMA}.phone_lead_links "
                f"WHERE phone_contact_id = {cid} AND lead_id = {int(lead_id)}"
            )
        conn.commit()
        return _ok({'success': True})

    if method == 'POST':
        phone = _safe(body.get('phone') or '', 30)
        if not phone:
            return _err(400, 'Телефон обязателен')
        norm = _normalize_phone(phone)
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            return _err(409, f'Номер уже существует с id={existing["id"]}')
        name = _safe(body.get('name') or '', 200)
        company = _safe(body.get('company') or '', 200)
        notes = _safe(body.get('notes') or '', 2000)
        tags = _safe(body.get('tags') or '', 500)
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name, company, notes, tags, created_by) "
            f"VALUES ('{_safe(phone, 30)}', '{norm}', '{name}', '{company}', '{notes}', '{tags}', {user['id']}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        if user['role'] not in ('admin', 'director'):
            return _err(403, 'Нет прав на удаление')
        cid = int(rid)
        cur.execute(f"UPDATE {SCHEMA}.listings SET owner_phone_contact_id = NULL WHERE owner_phone_contact_id = {cid}")
        cur.execute(f"UPDATE {SCHEMA}.listings SET owner_phone2_contact_id = NULL WHERE owner_phone2_contact_id = {cid}")
        cur.execute(f"UPDATE {SCHEMA}.leads SET phone_contact_id = NULL WHERE phone_contact_id = {cid}")
        cur.execute(f"UPDATE {SCHEMA}.crm_owners SET phone_contact_id = NULL WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_lead_links WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_listing_links WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_contact_history WHERE phone_contact_id = {cid}")
        cur.execute(f"DELETE FROM {SCHEMA}.phone_contacts WHERE id = {cid}")
        conn.commit()
        return _ok({'success': True})

    if method == 'PUT' and rid:
        cid = int(rid)
        # fetch current values for history
        cur.execute(f"SELECT * FROM {SCHEMA}.phone_contacts WHERE id = {cid}")
        old_row = cur.fetchone()
        if not old_row:
            return _err(404, 'Не найдено')
        old_data = dict(old_row)

        fields = []
        tracked = [('name', 200), ('company', 200), ('notes', 2000), ('tags', 500), ('inn', 12), ('photo_url', 500)]
        for f, length in tracked:
            if f in body:
                fields.append(f"{f} = {_str_or_null(body[f], length)}")
        if 'phone' in body:
            new_phone = _safe(body['phone'], 30)
            new_norm = _normalize_phone(new_phone)
            fields.append(f"phone = '{new_phone}'")
            fields.append(f"phone_normalized = '{new_norm}'")
        if not fields:
            return _err(400, 'Нет полей')
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.phone_contacts SET {', '.join(fields)} WHERE id = {cid}")

        # write history for changed fields
        history_fields = [f for f, _ in tracked] + ['phone']
        for hf in history_fields:
            if hf not in body:
                continue
            old_val = str(old_data.get(hf) or '')
            new_val = _safe(str(body.get(hf) or ''), 500)
            if old_val != new_val:
                old_esc = old_val.replace("'", "''")
                new_esc = new_val.replace("'", "''")
                cur.execute(
                    f"INSERT INTO {SCHEMA}.phone_contact_history "
                    f"(phone_contact_id, changed_by, field_name, old_value, new_value) "
                    f"VALUES ({cid}, {user['id']}, '{hf}', '{old_esc}', '{new_esc}')"
                )

        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _sync_phones(cur, conn):
    synced = 0
    cur.execute(
        f"SELECT id, owner_phone, owner_name FROM {SCHEMA}.listings "
        f"WHERE owner_phone IS NOT NULL AND owner_phone != ''"
    )
    listings = cur.fetchall()
    for row in listings:
        phone = row['owner_phone']
        norm = _normalize_phone(phone)
        if not norm:
            continue
        name = row['owner_name'] or ''
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            cid = existing['id']
        else:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name) "
                f"VALUES ('{_safe(phone, 30)}', '{norm}', '{_safe(name, 200)}') RETURNING id"
            )
            cid = cur.fetchone()['id']
            synced += 1
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_listing_links (phone_contact_id, listing_id, role) "
            f"VALUES ({cid}, {row['id']}, 'owner') ON CONFLICT DO NOTHING"
        )
    cur.execute(
        f"SELECT id, phone, name FROM {SCHEMA}.leads WHERE phone IS NOT NULL AND phone != ''"
    )
    leads = cur.fetchall()
    for row in leads:
        phone = row['phone']
        norm = _normalize_phone(phone)
        if not norm:
            continue
        name = row['name'] or ''
        cur.execute(f"SELECT id FROM {SCHEMA}.phone_contacts WHERE phone_normalized = '{norm}'")
        existing = cur.fetchone()
        if existing:
            cid = existing['id']
        else:
            cur.execute(
                f"INSERT INTO {SCHEMA}.phone_contacts (phone, phone_normalized, name) "
                f"VALUES ('{_safe(phone, 30)}', '{norm}', '{_safe(name, 200)}') RETURNING id"
            )
            cid = cur.fetchone()['id']
            synced += 1
        cur.execute(
            f"INSERT INTO {SCHEMA}.phone_lead_links (phone_contact_id, lead_id) "
            f"VALUES ({cid}, {row['id']}) ON CONFLICT DO NOTHING"
        )
    conn.commit()
    return synced


def _ser_phone(row):
    for k in ('created_at', 'updated_at'):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    return row


def _ser(row):
    if row.get('tags'):
        row['tags'] = [t.strip() for t in str(row['tags']).split(',') if t.strip()]
    else:
        row['tags'] = []
    for k in ('lat', 'lng'):
        if row.get(k) is not None:
            row[k] = float(row[k])
    for k in ('created_at', 'updated_at'):
        if row.get(k) is not None:
            row[k] = row[k].isoformat()
    return row


def _listing_documents(cur, conn, method, rid, action, event, user):
    ALLOWED = ('admin', 'director', 'broker', 'office_manager', 'manager')
    if user['role'] not in ALLOWED:
        return _err(403, 'Нет прав')
    qs = event.get('queryStringParameters') or {}
    listing_id = qs.get('listing_id') or (rid and str(rid))
    if not listing_id:
        return _err(400, 'Не указан listing_id')
    lid = int(listing_id)

    if method == 'GET':
        cur.execute(
            f"SELECT d.id, d.listing_id, d.name, d.url, d.created_at, u.name AS uploader_name "
            f"FROM {SCHEMA}.listing_documents d "
            f"LEFT JOIN {SCHEMA}.users u ON u.id = d.uploaded_by "
            f"WHERE d.listing_id = {lid} ORDER BY d.created_at DESC"
        )
        docs = []
        for r in cur.fetchall():
            d = dict(r)
            d['created_at'] = d['created_at'].isoformat() if d.get('created_at') else None
            docs.append(d)
        return _ok({'documents': docs})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        name = _safe(body.get('name') or '', 255)
        url = _safe(body.get('url') or '', 1000)
        if not name or not url:
            return _err(400, 'Имя и URL обязательны')
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_documents (listing_id, uploaded_by, name, url) "
            f"VALUES ({lid}, {user['id']}, '{name}', '{url}') RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"SELECT id, uploaded_by FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}")
        doc = cur.fetchone()
        if not doc:
            return _err(404, 'Документ не найден')
        if user['role'] not in ('admin', 'director') and doc['uploaded_by'] != user['id']:
            return _err(403, 'Нельзя удалить чужой документ')
        cur.execute(f"UPDATE {SCHEMA}.listing_documents SET url = url WHERE id = {int(rid)}")
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_documents (listing_id, uploaded_by, name, url) "
            f"SELECT listing_id, uploaded_by, '[УДАЛЁН] ' || name, url FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}"
        )
        cur.execute(f"DELETE FROM {SCHEMA}.listing_documents WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    if method == 'PUT' and rid:
        name = _safe(body.get('name') or '', 255)
        if name:
            cur.execute(f"UPDATE {SCHEMA}.listing_documents SET name = '{name}' WHERE id = {int(rid)}")
            conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _is_listing_team_member(cur, listing_id: int, user: dict) -> bool:
    """Проверяет, входит ли пользователь в 'команду объекта'.
    Команда = автор объекта + брокер объекта + админ + директор.
    """
    role = user.get('role', '')
    if role in ('admin', 'director'):
        return True
    cur.execute(
        f"SELECT author_id, broker_id FROM {SCHEMA}.listings WHERE id = {int(listing_id)}"
    )
    row = cur.fetchone()
    if not row:
        return False
    uid = user.get('id')
    return uid == row.get('author_id') or uid == row.get('broker_id')


def _listing_comments(cur, conn, method, rid, event, user):
    qs = event.get('queryStringParameters') or {}
    listing_id = qs.get('listing_id') or (rid and str(rid))
    if not listing_id:
        return _err(400, 'Не указан listing_id')
    lid = int(listing_id)

    # Проверка доступа: только команда объекта может видеть/писать комментарии
    if method in ('GET', 'POST') and not _is_listing_team_member(cur, lid, user):
        return _err(403, 'Чат комментариев доступен только команде объекта (автору, брокеру, директору и админу)')

    if method == 'GET':
        cur.execute(
            f"SELECT c.id, c.listing_id, c.user_id, c.user_name, c.comment, c.is_ai, c.created_at "
            f"FROM {SCHEMA}.listing_comments c WHERE c.listing_id = {lid} ORDER BY c.created_at ASC"
        )
        comments = []
        for r in cur.fetchall():
            d = dict(r)
            d['created_at'] = d['created_at'].isoformat() if d.get('created_at') else None
            comments.append(d)
        return _ok({'comments': comments})

    body = json.loads(event.get('body') or '{}')

    if method == 'POST':
        comment = _safe(body.get('comment') or '', 3000)
        if not comment:
            return _err(400, 'Пустой комментарий')
        is_ai = bool(body.get('is_ai', False))
        uname = _safe(user['name'], 150)
        cur.execute(
            f"INSERT INTO {SCHEMA}.listing_comments (listing_id, user_id, user_name, comment, is_ai) "
            f"VALUES ({lid}, {user['id']}, '{uname}', '{comment}', {str(is_ai).upper()}) RETURNING id"
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        return _ok({'id': new_id, 'success': True})

    if method == 'DELETE' and rid:
        cur.execute(f"SELECT user_id FROM {SCHEMA}.listing_comments WHERE id = {int(rid)}")
        c = cur.fetchone()
        if not c:
            return _err(404, 'Не найдено')
        if user['role'] not in ('admin', 'director') and c['user_id'] != user['id']:
            return _err(403, 'Нельзя удалить чужой комментарий')
        cur.execute(f"DELETE FROM {SCHEMA}.listing_comments WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')


def _ai_inpaint(cur, event, user):
    """Стирает лишнее с фото через YandexART (перерисовка по prompt).

    Ожидает POST body: {image_url: string, prompt?: string}
    Возвращает: {ok: true, new_url: string} либо {error: ...}

    Замечание: настоящий *inpaint* (точечная замена области по маске) у Yandex
    отсутствует — мы используем YandexART image generation как ближайший аналог.
    Поэтому пока возвращаем 501, чтобы фронт показал понятное сообщение пользователю.
    """
    method = event.get('httpMethod', 'POST')
    if method != 'POST':
        return _err(405, 'Только POST')

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return _err(400, 'Некорректное тело запроса')

    image_url = (body.get('image_url') or '').strip()
    if not image_url:
        return _err(400, 'Не указан image_url')

    # Проверяем настройки
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        api_key = (row.get('yandex_api_key') or '').strip() if row else ''
        folder_id = (row.get('yandex_folder_id') or '').strip() if row else ''
    except Exception:
        api_key, folder_id = '', ''

    if not api_key or not folder_id:
        return _err(503,
            'YandexART не настроен. Добавьте API-ключ и Folder ID в Настройки → Интеграции, '
            'и убедитесь, что у сервисного аккаунта есть роль ai.imageGeneration.user.')

    # Сейчас у YandexART нет публичного inpaint API (только полная генерация по prompt).
    # Возвращаем 501 с понятным объяснением, чтобы UI показал тоаст пользователю.
    return _err(501,
        'Очистка фото через ИИ скоро будет доступна. У Yandex пока нет публичного inpaint API — '
        'мы интегрируем его, как только он выйдет, либо подключим стороннее inpaint-решение по запросу.')


def _ad_platform_keys(cur, conn, method, rid, event, user):
    if user['role'] not in ('admin', 'director'):
        return _err(403, 'Нет прав')

    if method == 'GET':
        cur.execute(
            f"SELECT id, platform, api_key, api_secret, extra, is_active, updated_at "
            f"FROM {SCHEMA}.ad_platform_keys ORDER BY platform ASC"
        )
        rows = []
        for r in cur.fetchall():
            d = dict(r)
            d['updated_at'] = d['updated_at'].isoformat() if d.get('updated_at') else None
            rows.append(d)
        return _ok({'platforms': rows})

    body = json.loads(event.get('body') or '{}')

    if method == 'PUT' and rid:
        fields = []
        if 'api_key' in body:
            fields.append(f"api_key = {_str_or_null(body.get('api_key'), 2000)}")
        if 'api_secret' in body:
            fields.append(f"api_secret = {_str_or_null(body.get('api_secret'), 2000)}")
        if 'is_active' in body:
            fields.append(f"is_active = {_bool(body.get('is_active'))}")
        if 'extra' in body:
            import json as _json
            extra_json = _json.dumps(body.get('extra') or {}).replace("'", "''")
            fields.append(f"extra = '{extra_json}'::jsonb")
        fields.append("updated_at = NOW()")
        cur.execute(f"UPDATE {SCHEMA}.ad_platform_keys SET {', '.join(fields)} WHERE id = {int(rid)}")
        conn.commit()
        return _ok({'success': True})

    return _err(400, 'Bad request')