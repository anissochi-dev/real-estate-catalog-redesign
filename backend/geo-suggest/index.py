"""
Подсказки адресов через DaData API (suggestions/address).
GET/POST ?query=Красная&city=Краснодар → [{value, unrestricted_value, lat, lon}]
"""
import json
import os
import urllib.request

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def handler(event: dict, context) -> dict:
    """Возвращает подсказки адресов через DaData для поля адреса объекта."""
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

    suggestions = []
    for s in data.get('suggestions', []):
        value = s.get('value', '')
        data_obj = s.get('data', {})
        lat = data_obj.get('geo_lat')
        lon = data_obj.get('geo_lon')
        # Район из DaData: city_district_with_type или city_district
        city_district = (
            data_obj.get('city_district_with_type')
            or data_obj.get('city_district')
            or ''
        )
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
            'district': city_district,
        })

    return {
        'statusCode': 200,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(suggestions, ensure_ascii=False),
    }