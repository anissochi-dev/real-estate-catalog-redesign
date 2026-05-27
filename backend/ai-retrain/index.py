"""
Автоматическое переобучение ВБ: переиндексация базы знаний из новостей, объектов,
заявок, инвест-модели и рыночных цен с сайтов-агрегаторов Краснодара.
Запускается по расписанию (cron-вызов) или вручную из админки.
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import urllib.request
import urllib.error
from html.parser import HTMLParser
import re

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'POST')
    headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in headers.items()}
    token = headers_lc.get('x-auth-token') or headers_lc.get('x-authorization', '').replace('Bearer ', '')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Cron-вызов: проверяем расписание и запускаем если пора
            if action == 'cron':
                return _cron_check(cur, conn)

            # Ручной запуск или тест — нужна авторизация
            if not token:
                return _err(401, 'Нет токена')
            cur.execute(
                f"SELECT u.id, u.role FROM {SCHEMA}.users u "
                f"JOIN {SCHEMA}.user_sessions s ON s.user_id = u.id "
                f"WHERE s.auth_token = '{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
            )
            user = cur.fetchone()
            if not user:
                return _err(401, 'Неверный токен')
            if user['role'] not in ('admin', 'director'):
                return _err(403, 'Только admin и director')

            if method == 'GET':
                # Возвращаем статус последнего переобучения и расписание
                return _get_status(cur)

            if method == 'POST':
                body = json.loads(event.get('body') or '{}')
                sources = body.get('sources') or ['news', 'listings', 'invest', 'demand', 'terms', 'market_prices']
                result = _run_retrain(cur, conn, sources)
                return _ok(result)

            return _err(400, 'Bad request')
    finally:
        conn.close()


def _cron_check(cur, conn) -> dict:
    """Проверяет расписание и запускает переобучение если пора."""
    cur.execute(
        f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, vb_retrain_sources, "
        f"vb_retrain_last_at FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
    )
    s = cur.fetchone()
    if not s or not s.get('vb_retrain_enabled'):
        return _ok({'skipped': True, 'reason': 'disabled'})

    import datetime
    now = datetime.datetime.utcnow()
    target_hour = int(s.get('vb_retrain_hour') or 3)
    target_minute = int(s.get('vb_retrain_minute') or 0)
    last_at = s.get('vb_retrain_last_at')

    # Запускаем если: сейчас нужный час И минута попадает в 5-минутное окно
    if now.hour != target_hour:
        return _ok({'skipped': True, 'reason': f'not time yet, target={target_hour:02d}:{target_minute:02d} UTC, now={now.hour:02d}:{now.minute:02d} UTC'})
    if abs(now.minute - target_minute) > 5:
        return _ok({'skipped': True, 'reason': f'minute mismatch, target={target_minute}, now={now.minute}'})

    if last_at:
        last_date = last_at.date() if hasattr(last_at, 'date') else None
        if last_date and last_date >= now.date():
            return _ok({'skipped': True, 'reason': 'already run today'})

    sources_raw = s.get('vb_retrain_sources') or []
    if isinstance(sources_raw, str):
        try:
            sources_raw = json.loads(sources_raw)
        except Exception:
            sources_raw = ['news', 'listings', 'invest', 'demand', 'terms', 'market_prices']

    result = _run_retrain(cur, conn, sources_raw)
    return _ok({'auto': True, **result})


def _get_status(cur) -> dict:
    cur.execute(
        f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, vb_retrain_sources, "
        f"vb_retrain_last_at, vb_retrain_last_status, vb_retrain_last_saved "
        f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return _ok({'status': None})
    return _ok({
        'enabled': row.get('vb_retrain_enabled', False),
        'hour': row.get('vb_retrain_hour', 3),
        'minute': row.get('vb_retrain_minute', 0),
        'sources': row.get('vb_retrain_sources') or [],
        'last_at': str(row['vb_retrain_last_at']) if row.get('vb_retrain_last_at') else None,
        'last_status': row.get('vb_retrain_last_status'),
        'last_saved': row.get('vb_retrain_last_saved'),
    })


def _run_retrain(cur, conn, sources: list) -> dict:
    """Основная логика переобучения."""
    cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
    row = cur.fetchone() or {}
    api_key = row.get('yandex_api_key') or os.environ.get('YANDEX_API_KEY', '')
    folder_id = row.get('yandex_folder_id') or os.environ.get('YANDEX_FOLDER_ID', '')

    if not api_key or not folder_id:
        return {'success': False, 'error': 'YandexGPT не настроен'}

    total_saved = 0
    per_source = []

    for src in sources:
        try:
            saved, input_count, error = _process_source(cur, src, api_key, folder_id)
            total_saved += saved
            per_source.append({'source': src, 'saved': saved, 'input_count': input_count, 'error': error})
            conn.commit()
        except Exception as e:
            per_source.append({'source': src, 'saved': 0, 'input_count': 0, 'error': str(e)})

    # Обновляем статус в БД
    status_json = _esc(json.dumps(per_source, ensure_ascii=False))
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET "
        f"vb_retrain_last_at = NOW(), "
        f"vb_retrain_last_status = '{status_json[:2000]}', "
        f"vb_retrain_last_saved = {total_saved} "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)"
    )
    conn.commit()

    return {'success': True, 'saved': total_saved, 'per_source': per_source}


def _process_source(cur, src: str, api_key: str, folder_id: str):
    """Обрабатывает один источник: собирает данные, отправляет в GPT, сохраняет факты."""

    if src == 'market_prices':
        return _process_market_prices(cur, api_key, folder_id)

    if src == 'web_sources':
        return _process_web_sources(cur, api_key, folder_id)

    source_configs = {
        'news': {
            'prefix': 'news_',
            'system': (
                'Ты — помощник ВБ брокера коммерческой недвижимости Краснодара. '
                'На входе — новости рынка. Извлеки как можно больше фактов (50-100) для базы знаний — каждый факт отдельной записью.\n'
                'Формат: JSON-массив без markdown: [{"key": "news_slug", "value": "1-3 предложения"}, ...]\n'
                'key начинается с news_, латиница нижний регистр через _. Чем больше фактов — тем лучше.'
            ),
        },
        'listings': {
            'prefix': 'listing_',
            'system': (
                'Ты — помощник ВБ брокера коммерческой недвижимости Краснодара. '
                'На входе — описания объектов каталога. Извлеки 50-100 фактов: характеристики, особенности, закономерности по каждому объекту.\n'
                'Формат: JSON-массив без markdown: [{"key": "listing_slug", "value": "1-3 предложения"}, ...]\n'
                'key начинается с listing_. Чем больше фактов — тем лучше.'
            ),
        },
        'invest': {
            'prefix': 'invest_',
            'system': (
                'Ты — помощник ВБ брокера коммерческой недвижимости Краснодара. '
                'На входе — агрегированные данные о ценах и доходности. Извлеки 50-100 инвест-фактов с цифрами по каждой категории.\n'
                'Формат: JSON-массив без markdown: [{"key": "invest_slug", "value": "факт с цифрами"}, ...]\n'
                'key начинается с invest_. Чем больше фактов — тем лучше.'
            ),
        },
        'demand': {
            'prefix': 'demand_',
            'system': (
                'Ты — помощник ВБ брокера коммерческой недвижимости Краснодара. '
                'На входе — заявки клиентов. Извлеки 50-100 фактов о спросе: категории, бюджеты, задачи, районы.\n'
                'Формат: JSON-массив без markdown: [{"key": "demand_slug", "value": "1-3 предложения"}, ...]\n'
                'key начинается с demand_. Чем больше фактов — тем лучше.'
            ),
        },
        'terms': {
            'prefix': 'term_',
            'system': (
                'Ты — помощник ВБ брокера коммерческой недвижимости. '
                'На входе — описания объектов. Найди 50-100 терминов и понятий, объясни каждый.\n'
                'Формат: JSON-массив без markdown: [{"key": "term_slug", "value": "Термин — объяснение"}, ...]\n'
                'key начинается с term_. Чем больше терминов — тем лучше.'
            ),
        },
    }

    if src not in source_configs:
        return 0, 0, f'Неизвестный источник: {src}'

    cfg = source_configs[src]
    user_text, count_input = _fetch_db_source(cur, src)
    if not user_text:
        return 0, 0, 'Нет данных'

    raw = _call_gpt(api_key, folder_id, cfg['system'], user_text)
    facts = _parse_facts(raw)
    saved = _save_facts(cur, facts, cfg['prefix'])
    return saved, count_input, None


def _process_market_prices(cur, api_key: str, folder_id: str):
    """Парсит рыночные цены с сайтов-агрегаторов и сохраняет в базу знаний."""
    sites = [
        ('ayax', 'https://www.ayax.ru/kommercheskaya-nedvizhimost/'),
        ('etagi', 'https://krasnodar.etagi.com/commerce/'),
        ('cian', 'https://krasnodar.cian.ru/commercial/'),
    ]

    all_snippets = []
    for site_name, url in sites:
        try:
            snippet = _fetch_site_text(url, max_chars=3000)
            if snippet:
                all_snippets.append(f"=== {site_name.upper()} ({url}) ===\n{snippet}")
        except Exception as e:
            all_snippets.append(f"=== {site_name.upper()} === Ошибка загрузки: {e}")

    if not all_snippets:
        return 0, 0, 'Не удалось загрузить ни один сайт'

    combined = '\n\n'.join(all_snippets)[:9000]

    system_prompt = (
        'Ты — аналитик рынка коммерческой недвижимости Краснодара. '
        'На входе — HTML-контент страниц с объявлениями о продаже коммерческой недвижимости. '
        'Проанализируй цены, площади, районы. Извлеки 8-15 фактов о рынке:\n'
        '- Диапазоны цен по типам объектов (офис, торговля, склад, общепит)\n'
        '- Средняя цена за кв.м. по районам\n'
        '- Ценовые тренды и наблюдения\n'
        '- Популярные локации и предложения\n\n'
        'Формат: JSON-массив без markdown:\n'
        '[{"key": "market_price_slug", "value": "факт с цифрами и источником"}, ...]\n'
        'key начинается с market_, латиница нижний регистр через _. '
        'В value указывай конкретные цифры (руб/м², диапазоны цен).'
    )

    raw = _call_gpt(api_key, folder_id, system_prompt, combined)
    facts = _parse_facts(raw)
    saved = _save_facts(cur, facts, 'market_')
    return saved, len(sites), None


def _process_web_sources(cur, api_key: str, folder_id: str):
    """Обучает ВБ из пользовательских ссылок (vb_learn_sources)."""
    cur.execute(
        f"SELECT id, title, url FROM {SCHEMA}.vb_learn_sources "
        f"WHERE is_active = TRUE ORDER BY id ASC LIMIT 10"
    )
    sources_rows = cur.fetchall() or []
    if not sources_rows:
        return 0, 0, 'Нет активных источников-ссылок'

    all_snippets = []
    fetched_ids = []
    for row in sources_rows:
        try:
            snippet = _fetch_site_text(row['url'], max_chars=2500)
            if snippet:
                all_snippets.append(f"=== {row['title']} ({row['url']}) ===\n{snippet}")
                fetched_ids.append(row['id'])
        except Exception as e:
            all_snippets.append(f"=== {row['title']} === Ошибка: {str(e)[:100]}")

    if not any('===' in s and 'Ошибка' not in s for s in all_snippets):
        return 0, len(sources_rows), 'Не удалось загрузить ни один источник'

    combined = '\n\n'.join(all_snippets)[:9000]
    system_prompt = (
        'Ты — помощник ВБ брокера коммерческой недвижимости. '
        'На входе — контент сайтов, добавленных как источники знаний. '
        'Извлеки 5-15 полезных фактов для базы знаний брокера.\n'
        'Формат: JSON-массив без markdown: [{"key": "web_slug", "value": "факт 1-3 предложения"}, ...]\n'
        'key начинается с web_, латиница нижний регистр через _.'
    )
    raw = _call_gpt(api_key, folder_id, system_prompt, combined)
    facts = _parse_facts(raw)
    saved = _save_facts(cur, facts, 'web_')

    # Обновляем время последней загрузки
    if fetched_ids:
        ids_str = ','.join(str(i) for i in fetched_ids)
        cur.execute(
            f"UPDATE {SCHEMA}.vb_learn_sources SET last_fetched_at = NOW() WHERE id IN ({ids_str})"
        )

    return saved, len(sources_rows), None


def _fetch_site_text(url: str, max_chars: int = 3000) -> str:
    """Загружает страницу и извлекает текстовый контент."""
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (compatible; KnowledgeBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ru-RU,ru;q=0.9',
        }
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        raw_bytes = resp.read(500_000)

    encoding = 'utf-8'
    try:
        html = raw_bytes.decode(encoding, errors='replace')
    except Exception:
        html = raw_bytes.decode('cp1251', errors='replace')

    text = _html_to_text(html)
    # Оставляем только строки с цифрами/ценами/площадями
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 10:
            continue
        if re.search(r'\d', line):
            lines.append(line)
        elif len(lines) < 20:
            lines.append(line)
    result = '\n'.join(lines[:200])
    return result[:max_chars]


def _html_to_text(html: str) -> str:
    """Простой HTML → текст парсер."""
    class _P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []
            self._skip = False

        def handle_starttag(self, tag, attrs):
            if tag in ('script', 'style', 'noscript', 'head'):
                self._skip = True

        def handle_endtag(self, tag):
            if tag in ('script', 'style', 'noscript', 'head'):
                self._skip = False
            if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'br', 'tr'):
                self.parts.append('\n')

        def handle_data(self, data):
            if not self._skip:
                self.parts.append(data)

    p = _P()
    p.feed(html)
    text = ''.join(p.parts)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]{2,}', ' ', text)
    return text.strip()


def _fetch_db_source(cur, src: str):
    """Загружает данные из БД для нужного источника."""
    if src == 'news':
        cur.execute(
            f"SELECT title, summary, content FROM {SCHEMA}.news "
            f"WHERE is_published = TRUE ORDER BY COALESCE(published_at, created_at) DESC LIMIT 15"
        )
        rows = cur.fetchall() or []
        parts = []
        for n in rows:
            t = (n.get('title') or '').strip()
            s = (n.get('summary') or '').strip()[:300]
            c = (n.get('content') or '').strip()[:600]
            block = f'«{t}»'
            if s: block += f'\nКраткое: {s}'
            if c: block += f'\nПодробно: {c}'
            parts.append(block)
        return '\n\n---\n\n'.join(parts)[:8000], len(rows)

    if src == 'listings':
        cur.execute(
            f"SELECT title, category, deal, description, district, price, area, tags "
            f"FROM {SCHEMA}.listings WHERE status='active' AND LENGTH(COALESCE(description,''))>50 "
            f"ORDER BY updated_at DESC NULLS LAST LIMIT 30"
        )
        rows = cur.fetchall() or []
        parts = []
        for n in rows:
            t = (n.get('title') or '')[:120]
            d = (n.get('description') or '')[:500]
            meta = f"{n.get('category','')}/{n.get('deal','')} · {n.get('district','')} · {n.get('area','')} м² · {n.get('price','')} ₽"
            parts.append(f'«{t}» ({meta})\n{d}')
        return '\n\n---\n\n'.join(parts)[:9000], len(rows)

    if src == 'invest':
        cur.execute(
            f"SELECT category, deal, AVG(price) AS ap, AVG(price_per_m2) AS app2, "
            f"AVG(payback) AS apb, AVG(monthly_rent) AS arn, COUNT(*) AS cnt "
            f"FROM {SCHEMA}.listings WHERE status='active' "
            f"GROUP BY category, deal HAVING COUNT(*) > 0 ORDER BY cnt DESC LIMIT 30"
        )
        rows = cur.fetchall() or []
        parts = []
        for r in rows:
            parts.append(
                f"{r.get('category')}/{r.get('deal')}: цена {int(r.get('ap') or 0):,} ₽, "
                f"цена/м² {int(r.get('app2') or 0):,}, окупаемость ~{int(r.get('apb') or 0)} мес, "
                f"аренда {int(r.get('arn') or 0):,} ₽, объектов: {r.get('cnt')}"
            )
        return '\n'.join(parts)[:5000], len(rows)

    if src == 'demand':
        cur.execute(
            f"SELECT message, budget, request_category, lead_type "
            f"FROM {SCHEMA}.leads ORDER BY created_at DESC LIMIT 60"
        )
        rows = cur.fetchall() or []
        parts = []
        for r in rows:
            msg = (r.get('message') or '')[:200]
            budget = r.get('budget') or 0
            cat = r.get('request_category') or ''
            lt = r.get('lead_type') or ''
            parts.append(f"[{lt}/{cat}] бюджет {budget:,} ₽: {msg}")
        return '\n'.join(parts)[:7000], len(rows)

    if src == 'terms':
        cur.execute(
            f"SELECT description FROM {SCHEMA}.listings "
            f"WHERE status='active' AND LENGTH(COALESCE(description,''))>100 "
            f"ORDER BY updated_at DESC NULLS LAST LIMIT 40"
        )
        rows = cur.fetchall() or []
        parts = [(r.get('description') or '')[:400] for r in rows]
        return '\n\n'.join(parts)[:8000], len(rows)

    return '', 0


def _call_gpt(api_key: str, folder_id: str, system_prompt: str, user_text: str) -> str:
    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
        'completionOptions': {'stream': False, 'temperature': 0.3, 'maxTokens': '8000'},
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
    with urllib.request.urlopen(req_obj, timeout=25) as resp:
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


def _save_facts(cur, facts: list, prefix: str) -> int:
    count = 0
    for f in facts[:100]:
        if not isinstance(f, dict):
            continue
        k = _esc(str(f.get('key') or '').strip()[:100])
        v = _esc(str(f.get('value') or '').strip()[:5000])
        if not k or not v:
            continue
        if not k.replace("''", "'").startswith(prefix):
            k = _esc((prefix + k.replace("''", "'"))[:100])
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


def _esc(s) -> str:
    return str(s or '').replace("'", "''")[:5000]


def _ok(body: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}