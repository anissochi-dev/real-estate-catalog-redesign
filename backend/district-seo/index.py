"""
Генерирует и кеширует SEO-текст для страницы района города.
GPT-4o-mini пишет текст на основе статистики объектов в районе.
Args: GET ?district=Прикубанский&city=Краснодар
Returns: { text: str, cached: bool, stats: {count, avg_price} }
"""
import json
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_.'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

TYPE_LABELS = {
    'office': 'офисы', 'retail': 'торговые помещения', 'warehouse': 'склады',
    'restaurant': 'общепит', 'business': 'готовый бизнес', 'gab': 'арендный бизнес',
    'production': 'производство', 'hotel': 'гостиницы', 'land': 'земельные участки',
    'building': 'здания', 'free_purpose': 'помещения свободного назначения',
    'car_service': 'автосервисы',
}


def _ok(data):
    return {'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps(data, ensure_ascii=False)}


def _err(msg, status=400):
    return {'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
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


def _generate(district: str, city: str, stats: dict, cur) -> str:
    count = stats.get('count', 0)
    avg_price = stats.get('avg_price', 0)
    types = stats.get('types', [])

    type_str = ', '.join(TYPE_LABELS.get(t, t) for t in types[:4]) if types else 'офисы, торговые площади, склады'
    price_str = f'средняя стоимость — {int(avg_price):,} руб.'.replace(',', ' ') if avg_price else ''

    api_key = os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if not api_key or not folder_id:
        try:
            cur.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}settings ORDER BY id ASC LIMIT 1")
            row = cur.fetchone()
            if row:
                api_key = row.get('yandex_api_key') or api_key
                folder_id = row.get('yandex_folder_id') or folder_id
        except Exception:
            pass
    if not api_key or not folder_id:
        return ''

    prompt = (
        f'Напиши SEO-текст (3 абзаца, ~260 слов) о коммерческой недвижимости '
        f'в районе {district} города {city}.\n\n'
        f'Статистика: {count} активных объектов в базе. {price_str}\n'
        f'Типы объектов: {type_str}.\n\n'
        'Требования:\n'
        '- Опиши транспортную доступность и деловую активность района\n'
        '- Упомяни доступные типы объектов и их особенности\n'
        '- Включи ключевые запросы: аренда/продажа, район, город\n'
        '- Заверши призывом обратиться в агентство\n'
        '- Только связный текст, без заголовков, без markdown\n'
    )

    payload = {
        'modelUri': f'gpt://{folder_id}/yandexgpt/rc',
        'completionOptions': {'stream': False, 'temperature': 0.6, 'maxTokens': '800'},
        'messages': [
            {'role': 'system', 'text': 'SEO-копирайтер агентства коммерческой недвижимости. Только русский язык.'},
            {'role': 'user', 'text': prompt},
        ],
    }
    req = urllib.request.Request(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json', 'x-folder-id': folder_id},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode())
        alts = (data.get('result') or {}).get('alternatives') or []
        return ((alts[0].get('message') or {}).get('text') or '').strip() if alts else ''
    except Exception as e:
        print(f'[district-seo] YandexGPT error: {e}')
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

    district = (params.get('district') or body.get('district') or '').strip()
    city = (params.get('city') or body.get('city') or 'Краснодар').strip()
    force = str(params.get('force') or body.get('force') or '').lower() == 'true'

    if not district:
        return _err('district is required')

    cache_key = f'district:{district}'
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _err('DATABASE_URL not configured', 500)

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _ensure_table(cur)
            conn.commit()

            if not force:
                cur.execute(
                    f"SELECT seo_text FROM {SCHEMA}category_seo_cache "
                    "WHERE category = %s AND city = %s LIMIT 1",
                    (cache_key, city),
                )
                row = cur.fetchone()
                if row and row['seo_text']:
                    return _ok({'text': row['seo_text'], 'cached': True, 'stats': {}})

            # Статистика по объектам в районе
            cur.execute(
                f"SELECT COUNT(*) AS c, AVG(price) AS avg_p "
                f"FROM {SCHEMA}listings "
                f"WHERE status = 'active' AND district ILIKE %s",
                (f'%{district}%',),
            )
            agg = cur.fetchone() or {}
            cur.execute(
                f"SELECT category FROM {SCHEMA}listings "
                f"WHERE status = 'active' AND district ILIKE %s "
                "GROUP BY category ORDER BY COUNT(*) DESC LIMIT 5",
                (f'%{district}%',),
            )
            types = [r['category'] for r in cur.fetchall() if r.get('category')]
            stats = {
                'count': int(agg.get('c') or 0),
                'avg_price': float(agg.get('avg_p') or 0),
                'types': types,
            }

            text = _generate(district, city, stats, cur)
            if not text:
                return _err('GPT returned empty text', 502)

            cur.execute(
                f"INSERT INTO {SCHEMA}category_seo_cache (category, city, seo_text) "
                "VALUES (%s, %s, %s) "
                "ON CONFLICT (category, city) DO UPDATE SET seo_text = EXCLUDED.seo_text, created_at = NOW()",
                (cache_key, city, text),
            )
            conn.commit()
            return _ok({'text': text, 'cached': False, 'stats': stats})
    finally:
        conn.close()