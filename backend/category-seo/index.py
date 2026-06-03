"""
Генерирует и кеширует SEO-текстовый блок для посадочной страницы категории недвижимости.
Текст уникальный, информативный, ~300-400 слов — пишется GPT-4o-mini и сохраняется в БД.
При повторном запросе возвращается из кеша без вызова GPT.
Args: GET/POST ?category=office|retail|warehouse|...&city=Краснодар
Returns: { text: str, cached: bool }
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor
import openai

SCHEMA = 't_p71821556_real_estate_catalog_'

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


def _ok(data):
    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(data, ensure_ascii=False),
    }


def _err(msg, status=400):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }


def _ensure_table(cur):
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {SCHEMA}category_seo_cache (
            id SERIAL PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            city VARCHAR(100) NOT NULL DEFAULT 'Краснодар',
            seo_text TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(category, city)
        )
    """)


def _generate_text(category: str, city: str, stats: dict) -> str:
    ctx = CATEGORY_CONTEXT.get(category, (category, 'арендаторов и покупателей', 'коммерческие объекты'))
    obj_type, audience, examples = ctx

    count = stats.get('count', 0)
    avg_price = stats.get('avg_price', 0)
    min_area = stats.get('min_area', 0)
    max_area = stats.get('max_area', 0)

    stats_text = ''
    if count:
        stats_text += f'В базе сейчас {count} актуальных объектов. '
    if avg_price:
        stats_text += f'Средняя цена — {int(avg_price):,} руб. '.replace(',', ' ')
    if min_area and max_area:
        stats_text += f'Площади от {int(min_area)} до {int(max_area)} м². '

    prompt = (
        f'Напиши SEO-текст для посадочной страницы раздела «{obj_type}» на сайте агентства коммерческой недвижимости в {city}е.\n\n'
        f'Целевая аудитория: {audience}.\n'
        f'Примеры объектов в разделе: {examples}.\n'
        f'{stats_text}\n\n'
        'Требования:\n'
        '- Объём: 3-4 абзаца, ~300-400 слов\n'
        '- Стиль: профессиональный, деловой, без «воды»\n'
        '- Включи ключевые запросы: аренда/продажа, название типа объекта, город\n'
        '- Упомяни преимущества работы с агентством (опыт, база объектов, помощь в подборе)\n'
        '- Не используй заголовки и списки — только связный текст\n'
        '- Не дублируй info из hero-секции страницы — дополняй её\n'
        '- Только русский язык, без markdown\n'
    )

    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    resp = client.chat.completions.create(
        model='gpt-4o-mini',
        messages=[
            {'role': 'system', 'content': 'Ты SEO-копирайтер для агентства коммерческой недвижимости. Пишешь экспертные тексты на русском языке.'},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.6,
        max_tokens=800,
    )
    return (resp.choices[0].message.content or '').strip()


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

    category = (params.get('category') or body.get('category') or '').strip().lower()
    city = (params.get('city') or body.get('city') or 'Краснодар').strip()
    force = str(params.get('force') or body.get('force') or '').lower() == 'true'

    if not category:
        return _err('category is required')
    if category not in CATEGORY_CONTEXT:
        return _err(f'unknown category: {category}')

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _err('DATABASE_URL not configured', 500)

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _ensure_table(cur)
            conn.commit()

            # Проверяем кеш
            if not force:
                cur.execute(
                    f"SELECT seo_text FROM {SCHEMA}category_seo_cache "
                    "WHERE category = %s AND city = %s LIMIT 1",
                    (category, city),
                )
                row = cur.fetchone()
                if row and row['seo_text']:
                    return _ok({'text': row['seo_text'], 'cached': True})

            # Собираем статистику по категории
            cur.execute(
                f"SELECT COUNT(*) AS c, AVG(price) AS avg_p, "
                f"MIN(area) AS min_a, MAX(area) AS max_a "
                f"FROM {SCHEMA}listings "
                f"WHERE category = %s AND status = 'active'",
                (category,),
            )
            stats_row = cur.fetchone() or {}
            stats = {
                'count': int(stats_row.get('c') or 0),
                'avg_price': float(stats_row.get('avg_p') or 0),
                'min_area': float(stats_row.get('min_a') or 0),
                'max_area': float(stats_row.get('max_a') or 0),
            }

            # Генерируем текст через GPT
            text = _generate_text(category, city, stats)
            if not text:
                return _err('GPT returned empty text', 502)

            # Сохраняем в кеш (upsert)
            cur.execute(
                f"INSERT INTO {SCHEMA}category_seo_cache (category, city, seo_text) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (category, city) DO UPDATE SET seo_text = EXCLUDED.seo_text, created_at = NOW()",
                (category, city, text),
            )
            conn.commit()

            return _ok({'text': text, 'cached': False})
    finally:
        conn.close()
