"""
Тестовая проверка ключей Яндекс Геокодера.
Проверяет: ключ из БД (yandex_maps_api_key) и секрет YANDEX_GEOCODER_KEY.
"""
import json
import os
import urllib.request
import urllib.parse
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}
TEST_QUERY = 'Краснодар, ул. Красная, 1'


def _test_key(api_key: str) -> dict:
    if not api_key:
        return {'status': 'error', 'message': 'Ключ пустой'}
    url = (
        'https://geocode-maps.yandex.ru/1.x/?format=json&lang=ru_RU&results=1'
        f'&apikey={urllib.parse.quote(api_key)}'
        f'&geocode={urllib.parse.quote(TEST_QUERY)}'
    )
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            members = data.get('response', {}).get('GeoObjectCollection', {}).get('featureMember', [])
            if members:
                found = members[0]['GeoObject']['metaDataProperty']['GeocoderMetaData']['text']
                return {'status': 'ok', 'found': found}
            return {'status': 'ok', 'found': None, 'note': 'Ответ пустой'}
    except urllib.error.HTTPError as e:
        return {'status': 'error', 'http_code': e.code, 'message': str(e.reason)}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def handler(event: dict, context) -> dict:
    """Проверяет работу ключей Яндекс Геокодера: из БД и из секрета."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    # Ключ из БД
    db_key = ''
    try:
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"SELECT yandex_maps_api_key FROM {SCHEMA}.settings LIMIT 1")
        row = cur.fetchone()
        db_key = (row or {}).get('yandex_maps_api_key', '') or ''
        conn.close()
    except Exception as e:
        db_key = f'ERROR: {e}'

    # Ключ из секрета
    secret_key = os.environ.get('YANDEX_GEOCODER_KEY', '')

    result = {
        'test_query': TEST_QUERY,
        'db_key': {
            'value_preview': db_key[:8] + '...' if len(db_key) > 8 else db_key,
            'result': _test_key(db_key),
        },
        'secret_key': {
            'value_preview': secret_key[:8] + '...' if len(secret_key) > 8 else '(пусто)',
            'result': _test_key(secret_key) if secret_key else {'status': 'error', 'message': 'Секрет YANDEX_GEOCODER_KEY не задан'},
        },
    }

    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(result, ensure_ascii=False),
    }
