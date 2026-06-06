"""
Подсказки адресов через DaData API (suggestions/address).
GET ?query=Красная&city=Краснодар → [{value, full, lat, lon, district}]
Район определяется по справочнику street_district_map (улица → микрорайон).
"""
import json
import os
import re
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def _load_street_rules(conn) -> list:
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        f"SELECT street_pattern, district, house_from, house_to "
        f"FROM {SCHEMA}.street_district_map ORDER BY id ASC"
    )
    return cur.fetchall()


def _find_district(street: str, house_num, rules: list) -> str:
    """Ищет микрорайон по улице и номеру дома в справочнике."""
    street_lower = street.lower().strip()
    best = None
    for rule in rules:
        pat = rule['street_pattern'].lower().strip()
        if pat not in street_lower and pat != street_lower:
            continue
        h_from = rule['house_from']
        h_to = rule['house_to']
        if h_from is None and h_to is None:
            if best is None:
                best = rule['district']
        elif house_num is not None:
            if (h_from is None or house_num >= h_from) and (h_to is None or house_num <= h_to):
                return rule['district']
    return best or ''


def _extract_street_and_house(data_obj: dict) -> tuple:
    """Извлекает улицу и номер дома из объекта DaData."""
    street = data_obj.get('street', '') or ''
    house_str = data_obj.get('house', '') or ''
    house_num = None
    m = re.match(r'(\d+)', house_str)
    if m:
        house_num = int(m.group(1))
    return street, house_num


def handler(event: dict, context) -> dict:
    """Возвращает подсказки адресов через DaData с определением микрорайона по справочнику улиц."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    query = params.get('query', '').strip()
    city = params.get('city', 'Краснодар').strip()

    if not query:
        return {
            'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps([], ensure_ascii=False),
        }

    api_key = os.environ.get('DADATA_API_KEY', '')
    secret_key = os.environ.get('DADATA_SECRET_KEY', '')

    payload = json.dumps({
        'query': f'{city}, {query}',
        'count': 8,
        'locations': [{'city': city}],
        'restrict_value': False,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Token {api_key}',
            'X-Secret': secret_key,
        },
        method='POST',
    )

    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    # Загружаем справочник улиц один раз для всех подсказок
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    street_rules = _load_street_rules(conn)
    conn.close()

    suggestions = []
    for s in data.get('suggestions', []):
        value = s.get('value', '')
        data_obj = s.get('data', {})
        lat = data_obj.get('geo_lat')
        lon = data_obj.get('geo_lon')

        # Определяем микрорайон по справочнику улиц
        street, house_num = _extract_street_and_house(data_obj)
        district = _find_district(street, house_num, street_rules)

        # Убираем страну, регион и город из начала строки для краткости
        short = value
        for prefix in ['Россия, ', 'Краснодарский край, ', f'г {city}, ', f'{city}, ']:
            while short.startswith(prefix):
                short = short[len(prefix):]

        suggestions.append({
            'value': short,
            'full': value,
            'lat': float(lat) if lat else None,
            'lon': float(lon) if lon else None,
            'district': district,
        })

    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(suggestions, ensure_ascii=False),
    }
