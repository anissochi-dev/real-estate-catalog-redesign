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
                f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
                f"WHERE s.token = '{_esc(token)}' AND s.expires_at > NOW() LIMIT 1"
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
    """Обрабатывает ОДИН источник за вызов (укладывается в 30 сек таймаут).
    Прогресс сохраняется в vb_retrain_last_status.
    Каждый последующий cron-вызов берёт следующий источник по очереди.
    Когда все источники обработаны — выставляет vb_retrain_last_at = today."""
    import datetime

    cur.execute(
        f"SELECT vb_retrain_enabled, vb_retrain_hour, vb_retrain_minute, vb_retrain_sources, "
        f"vb_retrain_last_at, vb_retrain_last_status "
        f"FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
    )
    s = cur.fetchone()
    if not s or not s.get('vb_retrain_enabled'):
        return _ok({'skipped': True, 'reason': 'disabled'})

    now = datetime.datetime.utcnow()
    target_hour = int(s.get('vb_retrain_hour') or 3)
    target_minute = int(s.get('vb_retrain_minute') or 0)
    last_at = s.get('vb_retrain_last_at')

    # Читаем прогресс из last_status — ожидаем dict с полем in_progress (только от cron)
    status_raw = s.get('vb_retrain_last_status') or {}
    if isinstance(status_raw, str):
        try:
            status_raw = json.loads(status_raw)
        except Exception:
            status_raw = {}
    # Если last_status — список (от ручного запуска), игнорируем его как прогресс cron
    progress = status_raw if isinstance(status_raw, dict) else {}
    is_cron_progress = isinstance(progress, dict) and 'in_progress' in progress

    # Проверяем: либо уже идёт обработка (in_progress от cron), либо пора запускать
    in_progress = is_cron_progress and bool(progress.get('in_progress'))

    if not in_progress:
        # Не начато — проверяем что пора запускать
        if now.hour != target_hour:
            return _ok({'skipped': True, 'reason': f'not time, target={target_hour:02d}:{target_minute:02d}, now={now.hour:02d}:{now.minute:02d}'})
        if abs(now.minute - target_minute) > 30:  # широкое окно — 30 минут
            return _ok({'skipped': True, 'reason': f'minute out of window, target={target_minute}, now={now.minute}'})
        if last_at and is_cron_progress and progress.get('done'):
            # Считаем "уже сделано сегодня" только если последний cron-цикл был завершён сегодня
            try:
                last_date = last_at.date() if hasattr(last_at, 'date') else None
                if last_date and last_date >= now.date():
                    return _ok({'skipped': True, 'reason': 'already done today'})
            except Exception:
                pass

    # Определяем список источников
    sources_raw = s.get('vb_retrain_sources') or []
    if isinstance(sources_raw, str):
        try:
            sources_raw = json.loads(sources_raw)
        except Exception:
            sources_raw = ['news', 'listings', 'invest', 'demand', 'terms', 'market_prices', 'biweekly_history', 'market_history']
    if not sources_raw:
        sources_raw = ['news', 'listings', 'invest', 'demand', 'terms', 'market_prices', 'biweekly_history', 'market_history']

    done_sources = progress.get('done_sources') or []
    total_saved_so_far = int(progress.get('total_saved') or 0)

    # Берём следующий не обработанный источник
    remaining = [src for src in sources_raw if src not in done_sources]
    if not remaining:
        # Все источники обработаны — финализируем
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET "
            f"vb_retrain_last_at = NOW(), "
            f"vb_retrain_last_status = '{_esc(json.dumps({'done': True, 'in_progress': False, 'total_saved': total_saved_so_far, 'done_sources': done_sources}, ensure_ascii=False))}', "
            f"vb_retrain_last_saved = {total_saved_so_far} "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)"
        )
        conn.commit()
        return _ok({'auto': True, 'done': True, 'total_saved': total_saved_so_far})

    src = remaining[0]

    # Загружаем ключи GPT (нужны только для текстовых источников)
    PROGRAMMATIC_SOURCES = {'biweekly_history', 'invest', 'demand', 'market_history'}
    cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id LIMIT 1")
    keys = cur.fetchone() or {}
    api_key = keys.get('yandex_api_key') or os.environ.get('YANDEX_API_KEY', '')
    folder_id = keys.get('yandex_folder_id') or os.environ.get('YANDEX_FOLDER_ID', '')
    if (not api_key or not folder_id) and src not in PROGRAMMATIC_SOURCES:
        # GPT не настроен — пропускаем текстовый источник, продолжаем
        done_sources.append(src)
        new_remaining_check = [x for x in sources_raw if x not in done_sources]
        new_progress_skip = {'in_progress': len(new_remaining_check) > 0, 'done_sources': done_sources, 'total_saved': total_saved_so_far, 'last_source': src, 'last_saved': 0, 'last_error': 'YandexGPT not configured'}
        cur.execute(f"UPDATE {SCHEMA}.settings SET vb_retrain_last_status = '{_esc(json.dumps(new_progress_skip, ensure_ascii=False))}' WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)")
        conn.commit()
        return _ok({'auto': True, 'source': src, 'skipped': True, 'reason': 'YandexGPT not configured', 'remaining': new_remaining_check})

    # Обрабатываем один источник
    try:
        saved, input_count, error = _process_source(cur, src, api_key, folder_id)
        conn.commit()
    except Exception as e:
        saved, input_count, error = 0, 0, str(e)

    done_sources.append(src)
    total_saved_so_far += saved
    new_remaining = [x for x in sources_raw if x not in done_sources]

    new_progress = {
        'in_progress': len(new_remaining) > 0,
        'done_sources': done_sources,
        'total_saved': total_saved_so_far,
        'last_source': src,
        'last_saved': saved,
        'last_error': error,
    }

    cur.execute(
        f"UPDATE {SCHEMA}.settings SET "
        f"vb_retrain_last_status = '{_esc(json.dumps(new_progress, ensure_ascii=False))}' "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)"
    )
    conn.commit()

    return _ok({
        'auto': True,
        'source': src,
        'saved': saved,
        'error': error,
        'remaining': new_remaining,
        'total_saved': total_saved_so_far,
    })


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
        'market_history': {
            'prefix': 'market_hist_',
            'system': (
                'Ты — аналитик рынка коммерческой недвижимости Краснодара. '
                'На входе — исторические данные цен по годам, районам и категориям, а также макроэкономические показатели. '
                'Извлеки как можно больше (50-100) аналитических фактов: динамику цен по годам, сравнение районов, инвест-выводы, тренды.\n'
                'Формат: JSON-массив без markdown: [{"key": "market_hist_slug", "value": "факт с цифрами и годами"}, ...]\n'
                'key начинается с market_hist_, латиница нижний регистр через _. Чем больше фактов — тем лучше.'
            ),
        },
        'biweekly_history': {
            'prefix': 'biweekly_',
            'system': (
                'Ты — аналитик рынка коммерческой недвижимости Краснодара. '
                'На входе — среднегодовые цены продажи и аренды по 7 категориям с 2019 по 2026 год.\n\n'
                'ОБЯЗАТЕЛЬНО создай отдельный факт для каждой из следующих позиций:\n'
                '1. Для каждой категории (7 штук) — факт о динамике цены продажи за 7 лет с % роста от 2019 к 2026\n'
                '2. Для каждой категории аренды (6 штук) — факт о динамике арендной ставки\n'
                '3. Для каждого года (2019-2026, 8 штук) — факт о рынке в целом в этот год\n'
                '4. Топ-3 категории по росту цены за весь период\n'
                '5. Топ-3 категории по стабильности\n'
                '6. Аномальные скачки (резкий рост или падение более 20% за год) — по одному факту на каждый\n'
                '7. Сравнение 2019 vs 2026 для каждой категории\n\n'
                'Итого должно быть НЕ МЕНЕЕ 40 фактов. Каждый факт — конкретная цифра и вывод.\n'
                'Формат ответа — ТОЛЬКО JSON-массив, без текста вокруг:\n'
                '[{"key": "biweekly_retail_sale_trend", "value": "Торговая недвижимость (продажа): рост с 90917 руб/м2 в 2019 до 184077 руб/м2 в 2026, +102% за 7 лет"}, ...]\n'
                'key: латиница, нижний регистр, через _, начинается с biweekly_'
            ),
        },
    }

    if src not in source_configs:
        return 0, 0, f'Неизвестный источник: {src}'

    # Источники с числовыми данными — генерируем факты программно без GPT
    if src == 'biweekly_history':
        facts, count_input = _generate_biweekly_facts(cur)
        saved = _save_facts(cur, facts, 'biweekly_')
        print(f'[retrain:biweekly_history] generated={len(facts)} saved={saved}')
        return saved, count_input, None

    if src == 'invest':
        facts, count_input = _generate_invest_facts(cur)
        saved = _save_facts(cur, facts, 'invest_')
        print(f'[retrain:invest] generated={len(facts)} saved={saved}')
        return saved, count_input, None

    if src == 'demand':
        facts, count_input = _generate_demand_facts(cur)
        saved = _save_facts(cur, facts, 'demand_')
        print(f'[retrain:demand] generated={len(facts)} saved={saved}')
        return saved, count_input, None

    if src == 'market_history':
        facts, count_input = _generate_market_history_facts(cur)
        saved = _save_facts(cur, facts, 'market_hist_')
        print(f'[retrain:market_history] generated={len(facts)} saved={saved}')
        return saved, count_input, None

    # Текстовые источники — GPT интерпретирует
    cfg = source_configs[src]
    user_text, count_input = _fetch_db_source(cur, src)
    if not user_text:
        return 0, 0, 'Нет данных'

    print(f'[retrain:{src}] count_input={count_input} text_len={len(user_text)}')
    raw = _call_gpt(api_key, folder_id, cfg['system'], user_text)
    print(f'[retrain:{src}] gpt_raw_len={len(raw)} gpt_preview={repr(raw[:300])}')
    facts = _parse_facts(raw)
    print(f'[retrain:{src}] facts_count={len(facts)}')
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


def _generate_invest_facts(cur) -> tuple:
    """Программно генерирует инвест-факты из агрегатов по объявлениям."""
    cur.execute(
        f"SELECT category, deal, "
        f"COUNT(*) AS cnt, "
        f"ROUND(AVG(price)::numeric, 0) AS avg_price, "
        f"ROUND(MIN(price)::numeric, 0) AS min_price, "
        f"ROUND(MAX(price)::numeric, 0) AS max_price, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_p2, "
        f"ROUND(AVG(area)::numeric, 1) AS avg_area, "
        f"ROUND(AVG(payback)::numeric, 1) AS avg_payback, "
        f"ROUND(AVG(monthly_rent)::numeric, 0) AS avg_rent "
        f"FROM {SCHEMA}.listings WHERE status='active' "
        f"GROUP BY category, deal HAVING COUNT(*) > 0 ORDER BY cnt DESC"
    )
    rows = cur.fetchall() or []
    cat_ru = {
        'retail': 'Торговая', 'office': 'Офисная', 'warehouse': 'Складская',
        'industrial': 'Производственная', 'catering': 'Общепит',
        'free_purpose': 'ПСН', 'standalone': 'Отдельно стоящие здания',
    }
    deal_ru = {'sale': 'продажа', 'rent': 'аренда'}
    facts = []
    for r in rows:
        cat = cat_ru.get(r.get('category') or '', r.get('category') or '')
        dl = deal_ru.get(r.get('deal') or '', r.get('deal') or '')
        cnt = int(r.get('cnt') or 0)
        avg_p = int(r.get('avg_price') or 0)
        min_p = int(r.get('min_price') or 0)
        max_p = int(r.get('max_price') or 0)
        p2 = int(r.get('avg_p2') or 0)
        area = float(r.get('avg_area') or 0)
        payback = float(r.get('avg_payback') or 0)
        rent = int(r.get('avg_rent') or 0)
        slug = f"{r.get('category')}_{r.get('deal')}"

        facts.append({'key': f'invest_{slug}_count',
            'value': f'{cat} ({dl}): в каталоге {cnt} активных объектов'})
        if avg_p:
            facts.append({'key': f'invest_{slug}_price',
                'value': f'{cat} ({dl}): средняя цена {avg_p:,} ₽, диапазон {min_p:,}–{max_p:,} ₽'})
        if p2:
            facts.append({'key': f'invest_{slug}_price_m2',
                'value': f'{cat} ({dl}): средняя цена за м² — {p2:,} руб/м²'})
        if area:
            facts.append({'key': f'invest_{slug}_area',
                'value': f'{cat} ({dl}): средняя площадь объекта — {area} м²'})
        if payback and r.get('deal') == 'sale':
            facts.append({'key': f'invest_{slug}_payback',
                'value': f'{cat} (продажа): средний срок окупаемости — {payback:.0f} месяцев'})
        if rent and r.get('deal') == 'sale':
            facts.append({'key': f'invest_{slug}_rent',
                'value': f'{cat} (продажа): потенциальная арендная ставка — {rent:,} ₽/мес'})
    return facts, len(rows)


def _generate_demand_facts(cur) -> tuple:
    """Программно генерирует факты о спросе из лидов."""
    cur.execute(
        f"SELECT request_category, lead_type, COUNT(*) AS cnt, "
        f"ROUND(AVG(budget)::numeric, 0) AS avg_budget, "
        f"ROUND(MIN(budget)::numeric, 0) AS min_budget, "
        f"ROUND(MAX(budget)::numeric, 0) AS max_budget "
        f"FROM {SCHEMA}.leads "
        f"WHERE created_at > NOW() - INTERVAL '90 days' "
        f"GROUP BY request_category, lead_type HAVING COUNT(*) > 0 "
        f"ORDER BY cnt DESC LIMIT 30"
    )
    rows = cur.fetchall() or []
    # Общая статистика
    cur.execute(
        f"SELECT COUNT(*) AS total, "
        f"COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30d, "
        f"COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d "
        f"FROM {SCHEMA}.leads"
    )
    stats = cur.fetchone() or {}
    facts = []
    total = int(stats.get('total') or 0)
    last_30 = int(stats.get('last_30d') or 0)
    last_7 = int(stats.get('last_7d') or 0)
    if total:
        facts.append({'key': 'demand_total_leads',
            'value': f'Всего заявок в системе: {total}, за последние 30 дней: {last_30}, за 7 дней: {last_7}'})
    for r in rows:
        cat = r.get('request_category') or 'не указана'
        lt = r.get('lead_type') or 'не указан'
        cnt = int(r.get('cnt') or 0)
        avg_b = int(r.get('avg_budget') or 0)
        min_b = int(r.get('min_budget') or 0)
        max_b = int(r.get('max_budget') or 0)
        slug = f"{(r.get('request_category') or 'other').lower().replace(' ','_')}_{(r.get('lead_type') or 'other').lower()}"
        facts.append({'key': f'demand_{slug}_count',
            'value': f'Спрос: категория «{cat}», тип «{lt}» — {cnt} заявок за 90 дней'})
        if avg_b:
            facts.append({'key': f'demand_{slug}_budget',
                'value': f'Бюджет по заявкам «{cat}» ({lt}): средний {avg_b:,} ₽, диапазон {min_b:,}–{max_b:,} ₽'})
    return facts, len(rows)


def _generate_market_history_facts(cur) -> tuple:
    """Программно генерирует факты из price_history и macro_indicators."""
    cur.execute(
        f"SELECT year, district_name, category, deal_type, "
        f"avg_price_per_m2, avg_rent_per_m2_year, avg_cap_rate, vacancy_rate, notes "
        f"FROM {SCHEMA}.price_history ORDER BY year, district_name, category"
    )
    ph_rows = cur.fetchall() or []
    cur.execute(
        f"SELECT date_recorded, key_rate, inflation_rate, investment_volume_rf, notes "
        f"FROM {SCHEMA}.macro_indicators ORDER BY date_recorded"
    )
    macro_rows = cur.fetchall() or []
    cat_ru = {
        'retail': 'Торговая', 'office': 'Офисная', 'warehouse': 'Складская',
        'industrial': 'Производственная', 'catering': 'Общепит',
        'free_purpose': 'ПСН', 'standalone': 'Отдельно стоящие здания',
    }
    facts = []
    for r in macro_rows:
        yr = str(r.get('date_recorded') or '')[:4]
        kr = r.get('key_rate')
        inf = r.get('inflation_rate')
        inv = r.get('investment_volume_rf')
        nt = (r.get('notes') or '')[:200]
        parts = []
        if kr: parts.append(f'ставка ЦБ {kr}%')
        if inf: parts.append(f'инфляция {inf}%')
        if inv: parts.append(f'инвестиции в РФ {inv} млрд руб')
        if nt: parts.append(nt)
        if parts:
            facts.append({'key': f'market_hist_macro_{yr}',
                'value': f'Макроэкономика {yr}: ' + ', '.join(parts)})
    for r in ph_rows:
        yr = r.get('year')
        dn = r.get('district_name') or 'Краснодар'
        cat = cat_ru.get(r.get('category') or '', r.get('category') or '')
        dt = 'продажа' if r.get('deal_type') == 'sale' else 'аренда'
        p2 = int(r.get('avg_price_per_m2') or 0)
        r2 = int(r.get('avg_rent_per_m2_year') or 0)
        cap = r.get('avg_cap_rate')
        vac = r.get('vacancy_rate')
        nt = (r.get('notes') or '')[:150]
        slug = f"{yr}_{(r.get('district_name') or 'krd').lower().replace(' ','_')[:20]}_{r.get('category')}_{r.get('deal_type')}"
        parts = []
        if p2: parts.append(f'цена {p2:,} руб/м²')
        if r2: parts.append(f'аренда {r2:,} руб/м²/год')
        if cap: parts.append(f'cap rate {cap}%')
        if vac: parts.append(f'вакансия {vac}%')
        if nt: parts.append(nt)
        if parts:
            facts.append({'key': f'market_hist_{slug}',
                'value': f'{yr} | {dn} | {cat} ({dt}): ' + ', '.join(parts)})
    return facts, len(ph_rows) + len(macro_rows)


def _generate_biweekly_facts(cur) -> tuple:
    """Генерирует факты о динамике цен программно — без GPT."""
    cat_ru = {
        'retail': 'Торговая недвижимость', 'office': 'Офисная недвижимость',
        'warehouse': 'Складская недвижимость', 'industrial': 'Производственные помещения',
        'catering': 'Помещения общепита', 'free_purpose': 'Помещения свободного назначения (ПСН)',
        'standalone': 'Отдельно стоящие здания',
    }
    cur.execute(
        f"SELECT EXTRACT(YEAR FROM date_recorded)::int AS yr, category, deal_type, "
        f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_price "
        f"FROM {SCHEMA}.price_history_biweekly "
        f"GROUP BY yr, category, deal_type ORDER BY category, deal_type, yr"
    )
    rows = cur.fetchall() or []

    # Группируем: {(category, deal_type): {year: avg_price}}
    from collections import defaultdict
    data = defaultdict(dict)
    for r in rows:
        data[(r['category'], r['deal_type'])][int(r['yr'])] = int(r['avg_price'] or 0)

    facts = []

    for (cat, dt), yearly in data.items():
        cat_label = cat_ru.get(cat, cat)
        dt_label = 'продажа' if dt == 'sale' else 'аренда/мес'
        years = sorted(yearly.keys())
        if not years:
            continue

        # Факт: динамика за весь период
        p_first = yearly[years[0]]
        p_last = yearly[years[-1]]
        if p_first > 0:
            pct = round((p_last - p_first) / p_first * 100)
            sign = '+' if pct >= 0 else ''
            facts.append({
                'key': f'biweekly_{cat}_{dt}_trend',
                'value': f'{cat_label} ({dt_label}): цена выросла с {p_first:,} руб/м² в {years[0]} до {p_last:,} руб/м² в {years[-1]} ({sign}{pct}% за {years[-1]-years[0]} лет)'
            })

        # Факты: цена каждого года
        for yr in years:
            facts.append({
                'key': f'biweekly_{cat}_{dt}_{yr}',
                'value': f'{cat_label} ({dt_label}) в {yr}: средняя цена {yearly[yr]:,} руб/м²'
            })

        # Факт: пик и минимум
        max_yr = max(yearly, key=yearly.get)
        min_yr = min(yearly, key=yearly.get)
        facts.append({
            'key': f'biweekly_{cat}_{dt}_peak',
            'value': f'{cat_label} ({dt_label}): пик цены в {max_yr} году — {yearly[max_yr]:,} руб/м²'
        })
        if min_yr != max_yr:
            facts.append({
                'key': f'biweekly_{cat}_{dt}_min',
                'value': f'{cat_label} ({dt_label}): минимальная цена в {min_yr} году — {yearly[min_yr]:,} руб/м²'
            })

        # Факты: год-к-году изменения > 15%
        for i in range(1, len(years)):
            y_prev, y_cur = years[i-1], years[i]
            p_prev, p_cur = yearly[y_prev], yearly[y_cur]
            if p_prev > 0:
                chg = round((p_cur - p_prev) / p_prev * 100)
                if abs(chg) >= 15:
                    direction = 'вырос' if chg > 0 else 'упал'
                    facts.append({
                        'key': f'biweekly_{cat}_{dt}_{y_prev}_{y_cur}_yoy',
                        'value': f'{cat_label} ({dt_label}): цена {direction} на {abs(chg)}% с {y_prev} по {y_cur} год ({p_prev:,} → {p_cur:,} руб/м²)'
                    })

    return facts, len(rows)


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

    if src == 'market_history':
        cur.execute(
            f"SELECT year, district_name, category, deal_type, "
            f"avg_price_per_m2, avg_rent_per_m2_year, avg_cap_rate, vacancy_rate, notes "
            f"FROM {SCHEMA}.price_history ORDER BY year, district_name, category"
        )
        ph_rows = cur.fetchall() or []
        cur.execute(
            f"SELECT date_recorded, key_rate, inflation_rate, investment_volume_rf, notes "
            f"FROM {SCHEMA}.macro_indicators ORDER BY date_recorded"
        )
        macro_rows = cur.fetchall() or []
        count_input = len(ph_rows) + len(macro_rows)
        parts = []
        if macro_rows:
            parts.append('=== Макроэкономика по годам ===')
            for r in macro_rows:
                yr = str(r.get('date_recorded') or '')[:4]
                kr = r.get('key_rate') or ''
                inf = r.get('inflation_rate') or ''
                inv = r.get('investment_volume_rf') or ''
                nt = (r.get('notes') or '')[:200]
                parts.append(f"{yr}: ставка ЦБ {kr}%, инфляция {inf}%, инвестиции {inv} млрд руб. {nt}")
        if ph_rows:
            parts.append('=== Цены по годам, районам и категориям ===')
            for r in ph_rows:
                p2 = int(r.get('avg_price_per_m2') or 0)
                r2 = int(r.get('avg_rent_per_m2_year') or 0)
                cap = r.get('avg_cap_rate') or ''
                vac = r.get('vacancy_rate') or ''
                nt = (r.get('notes') or '')[:150]
                line = (f"{r.get('year')} | {r.get('district_name')} | "
                        f"{r.get('category')}/{r.get('deal_type')}: ")
                if p2: line += f"цена {p2:,} руб/м², "
                if r2: line += f"аренда {r2:,} руб/м²/год, "
                if cap: line += f"cap rate {cap}%, "
                if vac: line += f"вакансия {vac}%, "
                if nt: line += nt
                parts.append(line.replace(',', ' '))
        return '\n'.join(parts)[:9000], count_input

    if src == 'biweekly_history':
        # Сводка мин/макс/среднее по всему периоду
        cur.execute(
            f"SELECT category, deal_type, "
            f"MIN(date_recorded) AS date_from, MAX(date_recorded) AS date_to, "
            f"MIN(price_per_m2) AS price_min, MAX(price_per_m2) AS price_max, "
            f"ROUND(AVG(price_per_m2)::numeric, 0) AS price_avg, COUNT(*) AS cnt "
            f"FROM {SCHEMA}.price_history_biweekly "
            f"GROUP BY category, deal_type ORDER BY deal_type, category"
        )
        summary_rows = cur.fetchall() or []
        # Годовые агрегаты (среднее за год) — компактно и информативно
        cur.execute(
            f"SELECT EXTRACT(YEAR FROM date_recorded)::int AS yr, category, deal_type, "
            f"ROUND(AVG(price_per_m2)::numeric, 0) AS avg_price, "
            f"ROUND(MIN(price_per_m2)::numeric, 0) AS min_price, "
            f"ROUND(MAX(price_per_m2)::numeric, 0) AS max_price "
            f"FROM {SCHEMA}.price_history_biweekly "
            f"GROUP BY yr, category, deal_type ORDER BY category, deal_type, yr"
        )
        yearly_rows = cur.fetchall() or []
        count_input = len(summary_rows) + len(yearly_rows)
        cat_ru = {
            'retail': 'Торговая', 'office': 'Офисная', 'warehouse': 'Складская',
            'industrial': 'Производственная', 'catering': 'Общепит',
            'free_purpose': 'ПСН', 'standalone': 'Отдельно стоящие здания',
        }
        parts = ['=== Сводка по категориям (весь период 2019-2026) ===']
        for r in summary_rows:
            cat = cat_ru.get(r.get('category') or '', r.get('category') or '')
            dt = 'продажа' if r.get('deal_type') == 'sale' else 'аренда'
            pmin = int(r.get('price_min') or 0)
            pmax = int(r.get('price_max') or 0)
            pavg = int(r.get('price_avg') or 0)
            parts.append(
                f"{cat} ({dt}): мин {pmin:,} руб/м2  макс {pmax:,} руб/м2  среднее {pavg:,} руб/м2"
                f"  период {r.get('date_from')}–{r.get('date_to')}  наблюдений {r.get('cnt')}"
            )
        parts.append('')
        parts.append('=== Среднегодовые цены по категориям ===')
        cur_cat = None
        for r in yearly_rows:
            cat_key = f"{r.get('category')}/{r.get('deal_type')}"
            if cat_key != cur_cat:
                cur_cat = cat_key
                cat = cat_ru.get(r.get('category') or '', r.get('category') or '')
                dt = 'продажа' if r.get('deal_type') == 'sale' else 'аренда'
                parts.append(f'--- {cat} ({dt}) ---')
            yr = r.get('yr')
            avg = int(r.get('avg_price') or 0)
            lo = int(r.get('min_price') or 0)
            hi = int(r.get('max_price') or 0)
            parts.append(f"  {yr}: среднее {avg:,}  диапазон {lo:,}–{hi:,} руб/м2")
        return '\n'.join(parts)[:9000], count_input

    return '', 0


def _call_gpt(api_key: str, folder_id: str, system_prompt: str, user_text: str) -> str:
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