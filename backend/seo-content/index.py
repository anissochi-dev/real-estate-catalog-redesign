"""
SEO-тексты для посадочных страниц: категории, районы и индекс цен рынка.
Заменяет category-seo (OpenAI) и district-seo (YandexGPT) — единый кеш, единый движок.

action=category     GET ?category=office&city=Краснодар
action=district     GET ?district=Прикубанский&city=Краснодар
action=market_index GET ?market=true&city=Краснодар
force=true          — сбросить кеш и перегенерировать

Returns: { text: str, cached: bool }
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from ai_client import load_keys, chat_simple

SCHEMA = 't_p71821556_real_estate_catalog_.'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

CATEGORY_CONTEXT = {
    'office':       ('офисные помещения', 'арендаторов и покупателей офисов', 'бизнес-центры, кабинеты, open-space'),
    'retail':       ('торговые помещения', 'ритейлеров, арендаторов торговых площадей', 'магазины, шоурумы, торговые центры'),
    'warehouse':    ('складские помещения', 'логистических компаний и арендаторов складов', 'склады, логистические центры, боксы'),
    'restaurant':   ('помещения под общепит', 'рестораторов и арендаторов кафе', 'кафе, рестораны, бары, фастфуд, пекарни'),
    'hotel':        ('гостиницы и мини-отели', 'инвесторов в гостиничный бизнес', 'гостиницы, мини-отели, апарт-комплексы, хостелы'),
    'business':     ('готовый бизнес', 'покупателей готового бизнеса', 'магазины, кафе, производства, сервисные компании'),
    'gab':          ('готовый арендный бизнес (ГАБ)', 'инвесторов в коммерческую недвижимость', 'объекты с долгосрочными арендаторами и стабильным доходом'),
    'production':   ('производственные помещения', 'производителей и арендаторов цехов', 'цеха, мастерские, промышленные базы'),
    'land':         ('земельные участки под коммерцию', 'застройщиков и инвесторов', 'участки под торговлю, склады, производство'),
    'building':     ('отдельно стоящие здания', 'покупателей и арендаторов зданий', 'административные здания, особняки, торговые здания'),
    'free_purpose': ('помещения свободного назначения', 'арендаторов под разные виды бизнеса', 'универсальные коммерческие помещения'),
    'car_service':  ('автосервисы и автобизнес', 'владельцев автосервисов', 'боксы, мастерские, автомойки, шиномонтажи'),
}

TYPE_LABELS = {
    'office': 'офисы', 'retail': 'торговые помещения', 'warehouse': 'склады',
    'restaurant': 'общепит', 'business': 'готовый бизнес', 'gab': 'арендный бизнес',
    'production': 'производство', 'hotel': 'гостиницы', 'land': 'земельные участки',
    'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервисы',
}


def _ok(data):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps(data, ensure_ascii=False)}


def _err(msg, status=400):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _ensure_table(cur):
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}category_seo_cache (
            id SERIAL PRIMARY KEY,
            category VARCHAR(100) NOT NULL,
            city VARCHAR(100) NOT NULL DEFAULT 'Краснодар',
            seo_text TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(category, city)
        )
    """)


def _load_yandex_keys(cur) -> tuple:
    """Загружает ключи YandexGPT из БД, fallback — env."""
    return load_keys()


def _yandex_gpt(prompt: str, system: str, api_key: str, folder_id: str) -> str:
    return chat_simple(system, prompt, api_key, folder_id,
                       temperature=0.6, max_tokens=800, timeout=25)


def _prompt_category(category: str, city: str, stats: dict) -> str:
    ctx = CATEGORY_CONTEXT.get(category, (category, 'арендаторов и покупателей', 'коммерческие объекты'))
    obj_type, audience, examples = ctx
    stats_text = ''
    if stats.get('count'):
        stats_text += f'В базе сейчас {stats["count"]} актуальных объектов. '
    if stats.get('avg_price'):
        stats_text += f'Средняя цена — {int(stats["avg_price"]):,} руб. '.replace(',', ' ')
    if stats.get('min_area') and stats.get('max_area'):
        stats_text += f'Площади от {int(stats["min_area"])} до {int(stats["max_area"])} м². '
    return (
        f'Напиши SEO-текст для посадочной страницы раздела «{obj_type}» на сайте агентства коммерческой недвижимости в {city}е.\n\n'
        f'Целевая аудитория: {audience}.\n'
        f'Примеры объектов: {examples}.\n'
        f'{stats_text}\n\n'
        'Требования: 3-4 абзаца ~300-400 слов, профессиональный стиль, включи ключевые запросы '
        '(аренда/продажа, тип объекта, город), упомяни преимущества агентства, без заголовков и markdown.'
    )


def _prompt_district(district: str, city: str, stats: dict, district_desc: str) -> str:
    type_str = ', '.join(TYPE_LABELS.get(t, t) for t in stats.get('types', [])[:4]) or 'офисы, торговые площади, склады'
    price_str = f'средняя стоимость — {int(stats["avg_price"]):,} руб.'.replace(',', ' ') if stats.get('avg_price') else ''
    desc_block = f'Характеристика района: {district_desc}\n' if district_desc else ''
    return (
        f'Напиши SEO-текст (3 абзаца, ~300 слов) о коммерческой недвижимости в районе {district} города {city}.\n\n'
        f'{desc_block}'
        f'Статистика: {stats.get("count", 0)} активных объектов в базе. {price_str}\n'
        f'Типы объектов: {type_str}.\n\n'
        'Требования: раскрой коммерческую привлекательность района, упомяни типы объектов, '
        'включи ключевые запросы (аренда/продажа, район, город), заверши призывом к агентству, без заголовков и markdown.'
    )


def _prompt_market_index(city: str, stats: dict) -> str:
    cats_str = ', '.join(TYPE_LABELS.get(c, c) for c in stats.get('categories', [])[:6]) or 'офисы, торговые помещения, склады'
    price_lines = []
    for row in stats.get('price_rows', [])[:6]:
        deal_ru = 'аренда' if row['deal'] == 'rent' else 'продажа'
        price_lines.append(f'{TYPE_LABELS.get(row["category"], row["category"])} ({deal_ru}) — {int(row["price"]):,} руб/м²'.replace(',', ' '))
    price_str = '; '.join(price_lines)
    return (
        f'Напиши SEO-текст (3-4 абзаца, ~350 слов) для страницы «Индекс цен коммерческой недвижимости {city}а» '
        f'на сайте агентства недвижимости.\n\n'
        f'Раздел содержит актуальные медианные цены за м² по категориям и районам, а также динамику предложения.\n'
        f'Категории объектов в базе: {cats_str}.\n'
        f'{f"Текущие ориентиры: {price_str}." if price_str else ""}\n\n'
        'Требования: объясни ценность индекса для арендаторов, покупателей и инвесторов, упомяни что цены '
        'обновляются на основе реальных рыночных предложений, включи ключевые запросы '
        '(цены на аренду/продажу коммерческой недвижимости, стоимость м², аналитика рынка, город), '
        'заверши призывом обратиться в агентство за консультацией, без заголовков и markdown.'
    )


def _get_district_desc(cur, district: str) -> str:
    try:
        cur.execute(
            f"SELECT description FROM {SCHEMA}districts "
            "WHERE is_active = TRUE AND (name ILIKE %s OR name ILIKE %s) LIMIT 1",
            (f'%{district}%', district),
        )
        row = cur.fetchone()
        return (row.get('description') or '').strip() if row else ''
    except Exception:
        return ''


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    city = (params.get('city') or body.get('city') or 'Краснодар').strip()
    force = str(params.get('force') or body.get('force') or '').lower() == 'true'

    # Определяем режим: category, district или market_index
    category = (params.get('category') or body.get('category') or '').strip().lower()
    district = (params.get('district') or body.get('district') or '').strip()
    market = str(params.get('market') or body.get('market') or '').lower() == 'true'

    if category:
        if category not in CATEGORY_CONTEXT:
            return _err(f'unknown category: {category}')
        cache_key = category
    elif district:
        cache_key = f'district:{district}'
    elif market:
        cache_key = 'market_index'
    else:
        return _err('category, district или market обязателен')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _ensure_table(cur)
            conn.commit()

            # Кеш
            if not force:
                cur.execute(
                    f"SELECT seo_text FROM {SCHEMA}category_seo_cache WHERE category = %s AND city = %s LIMIT 1",
                    (cache_key, city),
                )
                row = cur.fetchone()
                if row and row['seo_text']:
                    return _ok({'text': row['seo_text'], 'cached': True})

            api_key, folder_id = _load_yandex_keys(cur)
            if not api_key or not folder_id:
                return _err('Яндекс API не настроен', 502)

            system = 'SEO-копирайтер агентства коммерческой недвижимости. Только русский язык, без markdown.'

            if category:
                cur.execute(
                    f"SELECT COUNT(*) AS c, AVG(price) AS avg_p, MIN(area) AS min_a, MAX(area) AS max_a "
                    f"FROM {SCHEMA}listings WHERE category = %s AND status = 'active'",
                    (category,),
                )
                r = cur.fetchone() or {}
                stats = {'count': int(r.get('c') or 0), 'avg_price': float(r.get('avg_p') or 0),
                         'min_area': float(r.get('min_a') or 0), 'max_area': float(r.get('max_a') or 0)}
                prompt = _prompt_category(category, city, stats)
            elif district:
                cur.execute(
                    f"SELECT COUNT(*) AS c, AVG(price) AS avg_p FROM {SCHEMA}listings "
                    f"WHERE status = 'active' AND district ILIKE %s",
                    (f'%{district}%',),
                )
                agg = cur.fetchone() or {}
                cur.execute(
                    f"SELECT category FROM {SCHEMA}listings WHERE status = 'active' AND district ILIKE %s "
                    "GROUP BY category ORDER BY COUNT(*) DESC LIMIT 5",
                    (f'%{district}%',),
                )
                types = [r['category'] for r in cur.fetchall() if r.get('category')]
                stats = {'count': int(agg.get('c') or 0), 'avg_price': float(agg.get('avg_p') or 0), 'types': types}
                prompt = _prompt_district(district, city, stats, _get_district_desc(cur, district))
            else:
                cur.execute(
                    f"SELECT DISTINCT category FROM {SCHEMA}price_market_snapshots "
                    f"WHERE district = '' ORDER BY category LIMIT 8"
                )
                categories = [r['category'] for r in cur.fetchall() if r.get('category')]
                cur.execute(
                    f"SELECT DISTINCT ON (category, deal) category, deal, price_per_m2_median AS price "
                    f"FROM {SCHEMA}price_market_snapshots "
                    f"WHERE district = '' AND price_per_m2_median IS NOT NULL AND analogs_count >= 3 "
                    f"ORDER BY category, deal, snapshot_date DESC LIMIT 8"
                )
                price_rows = [dict(r) for r in cur.fetchall()]
                stats = {'categories': categories, 'price_rows': price_rows}
                prompt = _prompt_market_index(city, stats)

            text = _yandex_gpt(prompt, system, api_key, folder_id)
            if not text:
                return _err('GPT вернул пустой ответ', 502)

            cur.execute(
                f"INSERT INTO {SCHEMA}category_seo_cache (category, city, seo_text) VALUES (%s, %s, %s) "
                "ON CONFLICT (category, city) DO UPDATE SET seo_text = EXCLUDED.seo_text, created_at = NOW()",
                (cache_key, city, text),
            )
            conn.commit()
            return _ok({'text': text, 'cached': False})
    finally:
        conn.close()