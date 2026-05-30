"""
Автоматическая SEO-оптимизация объектов недвижимости.
Режимы:
  status       — статистика + настройки расписания + последние логи
  run          — запустить оптимизацию немедленно (вручную)
  preview      — предпросмотр без записи в БД
  schedule_get — получить настройки расписания
  schedule_set — сохранить настройки расписания
  cron         — вызывается автоматически (без авторизации, проверяет токен cron)
  log          — история запусков

Args: POST {action, limit?, listing_id?, ...}, headers X-Auth-Token
Returns: {processed, skipped, errors} или {status} или {schedule} и т.д.
"""

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
YANDEX_GPT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion'
YANDEX_MODEL_NAME = 'yandexgpt/rc'

SEO_SYSTEM_PROMPT = (
    'Ты — SEO-специалист агентства коммерческой недвижимости BIZNEST в Краснодаре. '
    'По данным объекта сгенерируй:\n'
    '1) seo_title — заголовок страницы до 65 символов: тип+площадь+район+действие+город. '
    'Пример: "Аренда офиса 120 м² в центре Краснодара | BIZNEST"\n'
    '2) seo_description — описание для выдачи до 155 символов: '
    'ключевые характеристики + УТП + призыв к действию. '
    'Пример: "Светлый офис 120 м² с евроремонтом, парковкой, охраной 24/7 в центре Краснодара. '
    'Арендуйте сейчас — звоните!"\n'
    'Без markdown, без кавычек, на русском языке.\n'
    'Формат строго:\nTITLE: <заголовок>\nDESCRIPTION: <описание>'
)

PAGE_SYSTEM_PROMPT = (
    'Ты — SEO-специалист агентства коммерческой недвижимости BIZNEST в Краснодаре. '
    'По описанию страницы сайта сгенерируй полный набор SEO-полей.\n'
    '- H1 — главный заголовок (до 70 символов).\n'
    '- H2 — подзаголовок раздела (до 60 символов).\n'
    '- H3 — подподзаголовок (до 50 символов).\n'
    '- H4 — подзаголовок (до 50 символов).\n'
    '- H5 — подзаголовок (до 50 символов).\n'
    '- H6 — подзаголовок (до 50 символов).\n'
    '- TITLE — заголовок вкладки браузера до 65 символов с упоминанием бренда BIZNEST.\n'
    '- DESCRIPTION — мета-описание для выдачи до 155 символов, с УТП и призывом.\n'
    '- ALT — alt-текст главного изображения страницы (до 125 символов).\n'
    '- KEYWORDS — 5-8 ключевых слов через запятую.\n'
    'Заголовки H2-H6 должны быть осмысленными и тематически связаны со страницей. '
    'Без markdown, без кавычек, на русском.\n'
    'Формат строго (каждое поле с новой строки):\n'
    'H1: <...>\nH2: <...>\nH3: <...>\nH4: <...>\nH5: <...>\nH6: <...>\n'
    'TITLE: <...>\nDESCRIPTION: <...>\nALT: <...>\nKEYWORDS: <...>'
)

PAGE_HINTS = {
    '/': 'Главная страница агентства коммерческой недвижимости BIZNEST в Краснодаре — каталог, новости, готовый бизнес.',
    '/catalog': 'Каталог всех активных объектов коммерческой недвижимости: офисы, склады, торговые, готовый бизнес.',
    '/map': 'Интерактивная карта объектов коммерческой недвижимости по Краснодару и краю.',
    '/favorites': 'Избранные объекты пользователя — сохранённые карточки коммерческой недвижимости.',
    '/compare': 'Сравнение коммерческой недвижимости — характеристики, цены, окупаемость в одной таблице.',
    '/network-tenants': 'Объекты с сетевыми арендаторами — готовый арендный бизнес с проверенным доходом.',
    '/news': 'Новости и аналитика рынка коммерческой недвижимости Краснодара и края.',
    '/about': 'О компании BIZNEST: команда брокеров, опыт, услуги для собственников и инвесторов.',
    '/contacts': 'Контакты офиса BIZNEST в Краснодаре: телефон, адрес, мессенджеры.',
}

_RU_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}


def _make_slug(title: str, listing_id: int) -> str:
    s = (title or '').lower()
    out = []
    for ch in s:
        out.append(_RU_MAP.get(ch, ch))
    s = ''.join(out)
    clean = []
    for ch in s:
        if ch.isalnum():
            clean.append(ch)
        elif ch in (' ', '-', '_'):
            clean.append('-')
    s = ''.join(clean)
    while '--' in s:
        s = s.replace('--', '-')
    s = s.strip('-')[:80].rstrip('-') or 'object'
    return f"{s}-{listing_id}"


ROBOTS_DISALLOW = [
    '/admin', '/admin/', '/login', '/auth', '/signin',
    '/api/', '/private/',
]

DEAL_RU = {'sale': 'Продажа', 'rent': 'Аренда', 'business': 'Готовый бизнес'}
CAT_RU = {
    'office': 'офиса', 'retail': 'магазина', 'warehouse': 'склада',
    'restaurant': 'кафе/ресторана', 'hotel': 'гостиницы', 'business': 'готового бизнеса',
    'gab': 'готового арендного бизнеса', 'production': 'производственного помещения',
    'land': 'земельного участка', 'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервиса',
}


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


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _load_keys(cur):
    try:
        cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row:
            return row.get('yandex_api_key') or '', row.get('yandex_folder_id') or ''
    except Exception:
        pass
    return os.environ.get('YANDEX_API_KEY', ''), os.environ.get('YANDEX_FOLDER_ID', '')


def _gpt(system: str, user_text: str, api_key: str, folder_id: str) -> dict:
    if not api_key or not folder_id:
        return {'error': 'YandexGPT не настроен'}
    payload = {
        'modelUri': f'gpt://{folder_id}/{YANDEX_MODEL_NAME}',
        'completionOptions': {'stream': False, 'temperature': 0.4, 'maxTokens': '800'},
        'messages': [{'role': 'system', 'text': system}, {'role': 'user', 'text': user_text}],
    }
    req = urllib.request.Request(
        YANDEX_GPT_URL,
        data=json.dumps(payload).encode(),
        headers={
            'Authorization': f'Api-Key {api_key}',
            'Content-Type': 'application/json',
            'x-folder-id': folder_id,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        text = ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
        return {'text': text}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {'error': 'YandexGPT отклонил ключ (401). Проверьте API-ключ в Настройки → Интеграции'}
        if e.code == 403:
            return {'error': 'YandexGPT: нет прав (403). Нужна роль ai.languageModels.user у сервисного аккаунта'}
        if e.code == 429:
            return {'error': 'YandexGPT: превышен лимит (429). Уменьшите размер пакета или подождите'}
        try:
            body_text = e.read().decode('utf-8', errors='replace')[:200]
        except Exception:
            body_text = ''
        return {'error': f'YandexGPT ошибка {e.code}: {body_text}'}
    except urllib.error.URLError as e:
        return {'error': f'Не удалось связаться с YandexGPT: {e.reason}'}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {str(e)[:200]}'}


def _build_prompt(listing: dict) -> str:
    deal = DEAL_RU.get(listing.get('deal', ''), listing.get('deal', ''))
    cat = CAT_RU.get(listing.get('category', ''), listing.get('category', ''))
    area = listing.get('area') or ''
    price = listing.get('price') or ''
    district = listing.get('district') or ''
    city = listing.get('city') or 'Краснодар'
    desc = (listing.get('description') or '')[:400]
    title = listing.get('title') or ''

    parts = [
        f'Тип сделки: {deal}',
        f'Тип объекта: {cat}',
        f'Площадь: {area} м²' if area else '',
        f'Цена: {price} ₽' if price else '',
        f'Район: {district}' if district else '',
        f'Город: {city}',
        f'Название: {title}' if title else '',
        f'Описание: {desc}' if desc else '',
    ]
    return '\n'.join(p for p in parts if p)


def _parse_seo(text: str) -> tuple:
    seo_title, seo_desc = '', ''
    for line in text.splitlines():
        line = line.strip()
        if line.upper().startswith('TITLE:'):
            seo_title = line[6:].strip()[:70]
        elif line.upper().startswith('DESCRIPTION:'):
            seo_desc = line[12:].strip()[:160]
    return seo_title, seo_desc


def _process_listing(cur, conn, listing: dict, api_key: str, folder_id: str, dry_run: bool = False) -> dict:
    lid = listing['id']
    prompt = _build_prompt(listing)
    result = _gpt(SEO_SYSTEM_PROMPT, prompt, api_key, folder_id)

    if 'error' in result:
        return {'id': lid, 'status': 'error', 'error': result['error']}

    seo_title, seo_desc = _parse_seo(result['text'])
    if not seo_title and not seo_desc:
        return {'id': lid, 'status': 'error', 'error': 'Не удалось распарсить ответ ИИ'}

    if not dry_run:
        st = _safe(seo_title, 120)
        sd = _safe(seo_desc, 300)
        cur.execute(
            f"UPDATE {SCHEMA}.listings SET "
            f"seo_title = '{st}', seo_description = '{sd}', updated_at = NOW() "
            f"WHERE id = {int(lid)}"
        )
        conn.commit()

    return {'id': lid, 'status': 'ok', 'seo_title': seo_title, 'seo_description': seo_desc}


def _run_batch(cur, conn, api_key: str, folder_id: str, limit: int, dry_run: bool,
               listing_id=None, triggered_by: str = 'manual') -> dict:
    """Запускает пакетную оптимизацию, пишет лог в БД."""
    started = datetime.now(timezone.utc)

    # Создаём запись лога
    cur.execute(
        f"INSERT INTO {SCHEMA}.seo_run_log (triggered_by, dry_run, started_at) "
        f"VALUES ('{_safe(triggered_by, 50)}', {'TRUE' if dry_run else 'FALSE'}, NOW()) "
        f"RETURNING id"
    )
    log_id = cur.fetchone()['id']
    conn.commit()

    if listing_id:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, district, city, description "
            f"FROM {SCHEMA}.listings WHERE id = {int(listing_id)} AND status = 'active'"
        )
    else:
        cur.execute(
            f"SELECT id, title, category, deal, price, area, district, city, description "
            f"FROM {SCHEMA}.listings WHERE status = 'active' "
            f"AND (seo_title IS NULL OR seo_title = '') "
            f"ORDER BY id DESC LIMIT {limit}"
        )

    listings = [dict(r) for r in cur.fetchall()]

    if not listings:
        cur.execute(
            f"UPDATE {SCHEMA}.seo_run_log SET processed=0, errors=0, total=0, "
            f"finished_at=NOW() WHERE id={log_id}"
        )
        conn.commit()
        return {'processed': 0, 'errors': 0, 'total': 0, 'results': [], 'log_id': log_id,
                'message': 'Все активные объекты уже имеют SEO-данные'}

    results = []
    processed = 0
    errors = 0
    for lst in listings:
        r = _process_listing(cur, conn, lst, api_key, folder_id, dry_run)
        results.append(r)
        if r['status'] == 'ok':
            processed += 1
        else:
            errors += 1

    # Обновляем лог
    details_json = _safe(json.dumps(results[:20], ensure_ascii=False), 5000)
    cur.execute(
        f"UPDATE {SCHEMA}.seo_run_log SET processed={processed}, errors={errors}, "
        f"total={len(listings)}, finished_at=NOW(), "
        f"details='{details_json}' WHERE id={log_id}"
    )
    # Обновляем расписание
    if not dry_run:
        cur.execute(
            f"UPDATE {SCHEMA}.seo_schedule SET last_run_at=NOW(), "
            f"last_run_processed={processed}, last_run_errors={errors} "
            f"WHERE id=1"
        )
    conn.commit()

    return {
        'processed': processed,
        'errors': errors,
        'total': len(listings),
        'dry_run': dry_run,
        'log_id': log_id,
        'results': results,
    }


def _should_run_now(schedule: dict) -> bool:
    """Проверяет, нужно ли запустить SEO сейчас по расписанию."""
    if not schedule.get('is_enabled'):
        return False

    now = datetime.now(timezone.utc)
    run_hour = schedule.get('run_hour', 3)

    # Запускаем только в указанный час UTC
    if now.hour != run_hour:
        return False

    last_run = schedule.get('last_run_at')
    if last_run:
        if isinstance(last_run, str):
            from datetime import datetime as dt
            try:
                last_run = dt.fromisoformat(last_run.replace('Z', '+00:00'))
            except Exception:
                last_run = None
        if last_run:
            # Не запускать чаще раза в сутки (защита от двойного срабатывания в один час)
            diff = now - last_run.replace(tzinfo=timezone.utc) if last_run.tzinfo is None else now - last_run
            if diff.total_seconds() < 23 * 3600 + 30 * 60:  # 23ч30мин — окно одного часа уже точно прошло
                return False

    return True


def _parse_page_seo(text: str) -> dict:
    """Парсит ответ ИИ для страницы во все SEO-поля."""
    fields = {
        'h1': '', 'h2': '', 'h3': '', 'h4': '', 'h5': '', 'h6': '',
        'title': '', 'description': '', 'alt_text': '', 'keywords': '',
    }
    # Лимиты длины по SEO-рекомендациям
    limits = {
        'h1': 70, 'h2': 60, 'h3': 50, 'h4': 50, 'h5': 50, 'h6': 50,
        'title': 120, 'description': 300, 'alt_text': 125, 'keywords': 500,
    }
    prefixes = [
        ('H1:', 'h1'), ('H2:', 'h2'), ('H3:', 'h3'), ('H4:', 'h4'),
        ('H5:', 'h5'), ('H6:', 'h6'), ('TITLE:', 'title'),
        ('DESCRIPTION:', 'description'), ('ALT:', 'alt_text'), ('KEYWORDS:', 'keywords'),
    ]
    for line in text.splitlines():
        line = line.strip()
        up = line.upper()
        for prefix, key in prefixes:
            if up.startswith(prefix):
                fields[key] = line[len(prefix):].strip().strip('"«»')[:limits[key]]
                break
    return fields


def _site_base_url(cur) -> str:
    """Достаём базовый URL сайта из настроек."""
    try:
        cur.execute(f"SELECT site_url FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row and row.get('site_url'):
            url = str(row['site_url']).rstrip('/')
            if url.startswith('http'):
                return url
    except Exception:
        pass
    return os.environ.get('SITE_URL', 'https://bmn.su').rstrip('/')


def _build_sitemap_xml(cur) -> tuple:
    """Возвращает (xml_string, urls_count)."""
    base = _site_base_url(cur)
    urls = []

    # Статические страницы из seo_pages (только не noindex)
    cur.execute(
        f"SELECT path, updated_at FROM {SCHEMA}.seo_pages "
        f"WHERE noindex = FALSE ORDER BY path"
    )
    for r in cur.fetchall():
        p = r.get('path') or '/'
        if p.startswith('/admin') or p.startswith('/login') or p.startswith('/auth'):
            continue
        upd = r.get('updated_at')
        urls.append((base + p, upd))

    # Активные объекты
    cur.execute(
        f"SELECT id, slug, title, updated_at FROM {SCHEMA}.listings "
        f"WHERE status = 'active' ORDER BY updated_at DESC NULLS LAST LIMIT 5000"
    )
    for r in cur.fetchall():
        lid = r.get('id')
        slug = r.get('slug') or _make_slug(r.get('title') or '', lid)
        path = f"/object/{slug}"
        urls.append((base + path, r.get('updated_at')))

    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, upd in urls:
        u_safe = u.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        lastmod = ''
        if upd:
            try:
                lastmod = f'<lastmod>{upd.strftime("%Y-%m-%d")}</lastmod>'
            except Exception:
                lastmod = ''
        parts.append(f'<url><loc>{u_safe}</loc>{lastmod}</url>')
    parts.append('</urlset>')
    return '\n'.join(parts), len(urls)


def _save_sitemap(cur, conn) -> dict:
    """Перестраивает sitemap.xml и кэширует в seo_artifacts."""
    xml, count = _build_sitemap_xml(cur)
    safe_xml = _safe(xml, 2_000_000)
    cur.execute(
        f"INSERT INTO {SCHEMA}.seo_artifacts (kind, content, urls_count, updated_at) "
        f"VALUES ('sitemap', '{safe_xml}', {int(count)}, NOW()) "
        f"ON CONFLICT (kind) DO UPDATE SET content = EXCLUDED.content, "
        f"urls_count = EXCLUDED.urls_count, updated_at = NOW()"
    )
    conn.commit()
    return {'urls_count': count, 'xml_length': len(xml)}


def _build_robots_txt(cur) -> str:
    base = _site_base_url(cur)
    lines = ['User-agent: *']
    for d in ROBOTS_DISALLOW:
        lines.append(f'Disallow: {d}')
    lines.append('Allow: /')
    lines.append('')
    lines.append(f'Sitemap: {base}/sitemap.xml')
    return '\n'.join(lines) + '\n'


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-Cron-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    raw_headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in raw_headers.items()}
    cron_token = headers_lc.get('x-cron-token') or ''

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    qs = event.get('queryStringParameters') or {}
    action = body.get('action') or qs.get('action') or 'status'

    # GET-короткие пути для роботов (?file=robots или ?file=sitemap)
    if method == 'GET':
        file_q = (qs.get('file') or '').lower()
        if file_q == 'robots':
            action = 'robots_txt'
        elif file_q == 'sitemap':
            action = 'sitemap_xml'
        elif not body and not qs.get('action'):
            # Дефолтный GET — статус (но это требует токена)
            pass

    # Токен пользователя: ищем во всех возможных местах, потому что Cloud Functions Gateway
    # режет заголовки на POST с JSON. Порядок: query (приоритетно — не режется),
    # затем заголовки, затем тело запроса как fallback.
    token = (
        qs.get('auth_token')
        or headers_lc.get('x-auth-token')
        or headers_lc.get('x-authorization')
        or headers_lc.get('authorization', '').replace('Bearer ', '').strip()
        or (body.get('auth_token') if isinstance(body, dict) else '')
        or ''
    )
    # Дополнительно — пытаемся прочитать токен из cookie
    if not token:
        cookie_str = headers_lc.get('cookie') or headers_lc.get('x-cookie') or ''
        for part in cookie_str.split(';'):
            kv = part.strip().split('=', 1)
            if len(kv) == 2 and kv[0].strip() in ('biznest_token', 'auth_token'):
                token = kv[1].strip()
                break

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Ping-режим: вызывается с сайта при каждом открытии страницы.
            # Публичный — без авторизации. Сам проверяет расписание и запускает если пора.
            # Защита от флуда: запуск не чаще раза в 23 часа (проверяется через last_run_at).
            if action == 'ping':
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule_row = cur.fetchone()
                if not schedule_row:
                    return _ok({'skipped': True, 'reason': 'no_schedule'})
                schedule = dict(schedule_row)
                if not _should_run_now(schedule):
                    return _ok({'skipped': True, 'reason': 'not_time'})
                api_key, folder_id = _load_keys(cur)
                if not api_key or not folder_id:
                    return _ok({'skipped': True, 'reason': 'no_gpt'})
                limit_val = schedule.get('batch_limit', 20)
                result = _run_batch(cur, conn, api_key, folder_id, limit_val, dry_run=False, triggered_by='schedule')
                return _ok({**result, 'triggered': True})

            # Публичные эндпоинты (без авторизации) ───────────────────────────
            if action == 'get_page_seo':
                path = (body.get('path') or qs.get('path') or '/').strip()
                p = _safe(path, 255)
                cur.execute(
                    f"SELECT path, title, description, h1, h2, h3, h4, h5, h6, alt_text, keywords, og_image, noindex "
                    f"FROM {SCHEMA}.seo_pages WHERE path = '{p}'"
                )
                row = cur.fetchone()
                if row:
                    return _ok({'page': dict(row)})
                return _ok({'page': None})

            if action == 'robots_txt':
                content = _build_robots_txt(cur)
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'public, max-age=3600',
                    },
                    'body': content,
                }

            if action == 'sitemap_xml':
                cur.execute(
                    f"SELECT content, updated_at FROM {SCHEMA}.seo_artifacts WHERE kind='sitemap'"
                )
                row = cur.fetchone()
                if row and row.get('content'):
                    xml = row['content']
                else:
                    xml, _cnt = _build_sitemap_xml(cur)
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/xml; charset=utf-8',
                        'Cache-Control': 'public, max-age=1800',
                    },
                    'body': xml,
                }

            # Cron-режим: запускается внешним планировщиком (с токеном) или вручную авторизованным
            if action == 'cron':
                expected_cron_token = os.environ.get('CRON_SECRET', '')
                if expected_cron_token and cron_token == expected_cron_token:
                    pass  # токен верный
                else:
                    user = _get_user(cur, token)
                    if not user or user['role'] not in ('admin', 'editor'):
                        return _err(403, 'Нет доступа')

                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule = cur.fetchone()
                if not schedule:
                    return _ok({'skipped': True, 'reason': 'Расписание не настроено'})

                schedule = dict(schedule)
                if not _should_run_now(schedule):
                    return _ok({'skipped': True, 'reason': 'Не время запуска или расписание отключено'})

                api_key, folder_id = _load_keys(cur)
                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен')

                limit = schedule.get('batch_limit', 20)
                result = _run_batch(cur, conn, api_key, folder_id, limit, dry_run=False, triggered_by='schedule')
                return _ok({**result, 'triggered_by': 'schedule'})

            # Все остальные действия — требуют авторизации
            user = _get_user(cur, token)
            if not user:
                # Сообщение более дружелюбное — фронт показывает его пользователю как есть
                return _err(401, 'Сессия истекла — войдите заново')
            if user['role'] not in ('admin', 'editor', 'director'):
                return _err(403, 'Недостаточно прав для управления SEO')

            api_key, folder_id = _load_keys(cur)

            if action == 'status':
                cur.execute(
                    f"SELECT "
                    f"COUNT(*) FILTER (WHERE status='active') AS total_active,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_title IS NULL OR seo_title='')) AS no_seo_title,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (seo_description IS NULL OR seo_description='')) AS no_seo_desc,"
                    f"COUNT(*) FILTER (WHERE status='active' AND (description IS NULL OR LENGTH(description)<50)) AS no_desc "
                    f"FROM {SCHEMA}.listings"
                )
                row = dict(cur.fetchone())

                # Расписание
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                schedule_row = cur.fetchone()
                schedule = dict(schedule_row) if schedule_row else {}

                # Последние 5 запусков
                cur.execute(
                    f"SELECT id, triggered_by, processed, errors, total, dry_run, started_at, finished_at "
                    f"FROM {SCHEMA}.seo_run_log ORDER BY started_at DESC LIMIT 5"
                )
                logs = [dict(r) for r in cur.fetchall()]

                return _ok({
                    'status': row,
                    'schedule': schedule,
                    'recent_logs': logs,
                    'gpt_configured': bool(api_key and folder_id),
                })

            if action == 'schedule_get':
                cur.execute(f"SELECT * FROM {SCHEMA}.seo_schedule ORDER BY id ASC LIMIT 1")
                row = cur.fetchone()
                return _ok({'schedule': dict(row) if row else {}})

            if action == 'schedule_set':
                is_enabled = bool(body.get('is_enabled', True))
                run_hour = max(0, min(23, int(body.get('run_hour', 3))))
                batch_limit = max(1, min(50, int(body.get('batch_limit', 20))))
                cur.execute(
                    f"UPDATE {SCHEMA}.seo_schedule SET "
                    f"is_enabled={'TRUE' if is_enabled else 'FALSE'}, "
                    f"run_hour={run_hour}, batch_limit={batch_limit}, "
                    f"updated_at=NOW() WHERE id=1"
                )
                conn.commit()
                return _ok({'ok': True, 'message': 'Расписание сохранено'})

            if action == 'log':
                limit_log = min(int(body.get('limit') or qs.get('limit') or 20), 100)
                cur.execute(
                    f"SELECT id, triggered_by, processed, errors, total, dry_run, started_at, finished_at "
                    f"FROM {SCHEMA}.seo_run_log ORDER BY started_at DESC LIMIT {limit_log}"
                )
                logs = [dict(r) for r in cur.fetchall()]
                return _ok({'logs': logs})

            if action in ('run', 'preview'):
                dry_run = action == 'preview'
                limit = min(int(body.get('limit') or qs.get('limit') or 10), 50)
                listing_id = body.get('listing_id') or qs.get('listing_id')

                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен. Добавьте ключи в Настройки → Интеграции.')

                triggered_by = 'preview' if dry_run else 'manual'
                result = _run_batch(
                    cur, conn, api_key, folder_id, limit, dry_run,
                    listing_id=listing_id, triggered_by=triggered_by
                )

                if 'message' in result:
                    return _ok(result)

                return _ok(result)

            # ── Мета-теги статических страниц ──────────────────────────────────
            if action == 'pages_list':
                cur.execute(
                    f"SELECT id, path, title, description, h1, h2, h3, h4, h5, h6, alt_text, keywords, og_image, "
                    f"noindex, auto_generated, manual_override, page_label, updated_at "
                    f"FROM {SCHEMA}.seo_pages ORDER BY path"
                )
                pages = [dict(r) for r in cur.fetchall()]
                # Дополним дефолтными путями, которых нет в таблице
                existing = {p['path'] for p in pages}
                for default_path in PAGE_HINTS.keys():
                    if default_path not in existing:
                        pages.append({
                            'path': default_path, 'title': '', 'description': '',
                            'h1': '', 'h2': '', 'h3': '', 'h4': '', 'h5': '', 'h6': '',
                            'alt_text': '', 'keywords': '', 'og_image': '',
                            'noindex': False, 'auto_generated': False,
                            'manual_override': False, 'updated_at': None,
                        })
                return _ok({'pages': pages})

            if action == 'page_save':
                path = (body.get('path') or '').strip()
                if not path or not path.startswith('/'):
                    return _err(400, 'Не указан путь страницы (path)')
                p = _safe(path, 255)
                t = _safe(body.get('title') or '', 500)
                d = _safe(body.get('description') or '', 1000)
                h = _safe(body.get('h1') or '', 500)
                h2 = _safe(body.get('h2') or '', 500)
                h3 = _safe(body.get('h3') or '', 500)
                h4 = _safe(body.get('h4') or '', 500)
                h5 = _safe(body.get('h5') or '', 500)
                h6 = _safe(body.get('h6') or '', 500)
                alt = _safe(body.get('alt_text') or '', 500)
                kw = _safe(body.get('keywords') or '', 500)
                og = _safe(body.get('og_image') or '', 500)
                noindex = 'TRUE' if body.get('noindex') else 'FALSE'

                cur.execute(
                    f"INSERT INTO {SCHEMA}.seo_pages "
                    f"(path, title, description, h1, h2, h3, h4, h5, h6, alt_text, keywords, og_image, noindex, auto_generated, manual_override, updated_at) "
                    f"VALUES ('{p}', '{t}', '{d}', '{h}', '{h2}', '{h3}', '{h4}', '{h5}', '{h6}', '{alt}', '{kw}', '{og}', {noindex}, FALSE, TRUE, NOW()) "
                    f"ON CONFLICT (path) DO UPDATE SET "
                    f"title=EXCLUDED.title, description=EXCLUDED.description, h1=EXCLUDED.h1, "
                    f"h2=EXCLUDED.h2, h3=EXCLUDED.h3, h4=EXCLUDED.h4, h5=EXCLUDED.h5, h6=EXCLUDED.h6, "
                    f"alt_text=EXCLUDED.alt_text, "
                    f"keywords=EXCLUDED.keywords, og_image=EXCLUDED.og_image, noindex=EXCLUDED.noindex, "
                    f"auto_generated=FALSE, manual_override=TRUE, updated_at=NOW()"
                )
                conn.commit()
                # Перестроим sitemap (страница могла стать (не)индексируемой)
                try:
                    _save_sitemap(cur, conn)
                except Exception:
                    pass
                return _ok({'ok': True, 'path': path})

            if action == 'page_generate':
                path = (body.get('path') or '').strip()
                if not path or not path.startswith('/'):
                    return _err(400, 'Не указан путь страницы (path)')
                if not api_key or not folder_id:
                    return _err(503, 'YandexGPT не настроен')

                hint = PAGE_HINTS.get(path, f'Страница сайта BIZNEST: {path}')
                user_text = f'Адрес страницы: {path}\nЧто это: {hint}'
                gpt = _gpt(PAGE_SYSTEM_PROMPT, user_text, api_key, folder_id)
                if 'error' in gpt:
                    return _err(502, gpt['error'])
                f = _parse_page_seo(gpt['text'])
                if not f['h1'] and not f['title']:
                    return _err(502, 'Не удалось распарсить ответ ИИ')

                p_safe = _safe(path, 255)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.seo_pages "
                    f"(path, title, description, h1, h2, h3, h4, h5, h6, alt_text, keywords, auto_generated, manual_override, updated_at) "
                    f"VALUES ('{p_safe}', '{_safe(f['title'], 500)}', '{_safe(f['description'], 1000)}', "
                    f"'{_safe(f['h1'], 500)}', '{_safe(f['h2'], 500)}', '{_safe(f['h3'], 500)}', "
                    f"'{_safe(f['h4'], 500)}', '{_safe(f['h5'], 500)}', '{_safe(f['h6'], 500)}', "
                    f"'{_safe(f['alt_text'], 500)}', '{_safe(f['keywords'], 500)}', TRUE, FALSE, NOW()) "
                    f"ON CONFLICT (path) DO UPDATE SET "
                    f"title=EXCLUDED.title, description=EXCLUDED.description, h1=EXCLUDED.h1, "
                    f"h2=EXCLUDED.h2, h3=EXCLUDED.h3, h4=EXCLUDED.h4, h5=EXCLUDED.h5, h6=EXCLUDED.h6, "
                    f"alt_text=EXCLUDED.alt_text, keywords=EXCLUDED.keywords, "
                    f"auto_generated=TRUE, manual_override=FALSE, updated_at=NOW()"
                )
                conn.commit()
                return _ok({'ok': True, 'page': {
                    'path': path, 'auto_generated': True, **f,
                }})

            # ── robots.txt и sitemap.xml ───────────────────────────────────────
            if action == 'files_status':
                cur.execute(
                    f"SELECT urls_count, updated_at FROM {SCHEMA}.seo_artifacts "
                    f"WHERE kind = 'sitemap'"
                )
                row = cur.fetchone()
                base = _site_base_url(cur)
                return _ok({
                    'robots_url': f'{base}/robots.txt',
                    'sitemap_url': f'{base}/sitemap.xml',
                    'sitemap_urls_count': (row['urls_count'] if row else 0),
                    'sitemap_updated_at': (row['updated_at'] if row else None),
                    'robots_disallow': ROBOTS_DISALLOW,
                })

            if action == 'sitemap_rebuild':
                r = _save_sitemap(cur, conn)
                return _ok({'ok': True, **r})

            # ── Публичная отдача robots.txt и sitemap.xml ──────────────────────
            # Эти actions работают без авторизации — обрабатываются раньше.

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')