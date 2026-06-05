"""
Business: Геокодирование адресов объектов через geocode.maps.co (OpenStreetMap) и автоисправление района.
Запускается вручную: action=preview (показать что изменится) или action=apply (применить).
Args: event с body {action: 'preview'|'apply', ids?: [int, ...]}, X-Auth-Token; context
Returns: список изменений {id, address, district_old, district_new}
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

# Карта: ключевые слова из ответа OSM → название района в БД
DISTRICT_MAP = [
    # Карасунский округ
    ('Пашковский', 'Пашковский (ПМР)'),
    ('Фестивальный', 'Фестивальный (ФМР)'),
    ('Юбилейный', 'Юбилейный (ЮМР)'),
    ('Черёмушки', 'Черёмушки (ЧМР)'),
    ('Черемушки', 'Черёмушки (ЧМР)'),
    ('Комсомольский', 'Комсомольский (КМР)'),
    ('Школьный', 'Школьный (ШМР)'),
    ('Славянский', 'Славянский (СМР)'),
    ('Музыкальный', 'Музыкальный'),
    ('Микрохирургия', 'Микрохирургия глаза (МХГ)'),
    ('Панорама', 'Панорама (Стадион Краснодар)'),
    ('40 лет Победы', '40 лет Победы'),
    ('КСК', 'Камвольно-суконный комбинат (КСК)'),
    ('Камвольно', 'Камвольно-суконный комбинат (КСК)'),
    ('РИП', 'Завод радиоизмерительных приборов (РИП)'),
    # Прикубанский округ
    ('Гидростроителей', 'Гидростроителей (ГМР)'),
    ('Губернский', 'Губернский'),
    ('Немецкая деревня', 'Немецкая деревня'),
    ('Авиагородок', 'Авиагородок'),
    ('Молодёжный', 'Молодёжный'),
    ('Молодежный', 'Молодёжный'),
    ('Жукова', 'Энка (Жукова)'),
    ('Энка', 'Энка (Жукова)'),
    ('Лазурный', 'Лазурный п.'),
    ('Российский', 'Российский п.'),
    ('Победитель', 'Победитель п.'),
    ('Плодородный', 'Плодородный п.'),
    ('Краснодарский п', 'Краснодарский п.'),
    ('Индустриальный', 'Индустриальный п.'),
    ('Берёзовый', 'Берёзовый п.'),
    ('Березовый', 'Берёзовый п.'),
    ('Колосистый', 'Колосистый п.'),
    ('Зиповский', 'Завод измерительных приборов (ЗИП)'),
    ('ЗИП', 'Завод измерительных приборов (ЗИП)'),
    ('Витаминкомбинат', 'Витаминкомбинат'),
    ('9-й километр', '9-й километр'),
    ('Западный обход', 'Западный обход'),
    ('ТЭЦ', 'Теплоэлектростанция (ТЭЦ)'),
    ('ККБ', 'Краевая клиническая больница (ККБ)'),
    ('Елизаветинск', 'Индустриальный п.'),
    # Западный округ
    ('Кожевенный', 'Кожевенный завод (Кожзавод)'),
    ('Покровка', 'Кожевенный завод (Кожзавод)'),
    ('СХИ', 'Сельскохозяйственный институт (СХИ)'),
    ('Сельскохозяйственный', 'Сельскохозяйственный институт (СХИ)'),
    # Центральный округ
    ('Табачная', 'Табачная фабрика (Табачка)'),
    ('ХБК', 'Хлопчато-бумажный комбинат (ХБК)'),
    ('Хлопчато', 'Хлопчато-бумажный комбинат (ХБК)'),
    ('Дубинка', 'Центральный (ЦМР)'),
    ('Центральный', 'Центральный (ЦМР)'),
]


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _geocode_one(address: str, api_key: str) -> dict:
    """Геокодирует адрес через geocode.maps.co (OSM Nominatim). Возвращает поля адреса."""
    query = urllib.parse.urlencode({
        'q': f'Краснодар, {address}',
        'api_key': api_key,
        'format': 'json',
        'addressdetails': 1,
        'limit': 1,
        'countrycodes': 'ru',
        'accept-language': 'ru',
    })
    url = f'https://geocode.maps.co/search?{query}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'biznest-geocoder/1.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read())
        if not results:
            return {}
        addr = results[0].get('address', {})
        return {
            'display_name': results[0].get('display_name', ''),
            'suburb': addr.get('suburb', ''),
            'neighbourhood': addr.get('neighbourhood', ''),
            'quarter': addr.get('quarter', ''),
            'city_district': addr.get('city_district', ''),
        }
    except urllib.error.HTTPError as e:
        body = e.read(300).decode('utf-8', errors='replace')
        return {'error': f'HTTP {e.code}: {body[:150]}'}
    except Exception as e:
        return {'error': str(e)}


def _detect_district(geo: dict) -> str | None:
    """Определяет район из нашего справочника по полям OSM-ответа."""
    if not geo:
        return None
    search_str = ' '.join(filter(None, [
        geo.get('suburb', ''),
        geo.get('neighbourhood', ''),
        geo.get('quarter', ''),
        geo.get('city_district', ''),
        geo.get('display_name', ''),
    ]))
    if not search_str:
        return None
    s = search_str.lower()
    for keyword, district_name in DISTRICT_MAP:
        if keyword.lower() in s:
            return district_name
    return None


def handler(event: dict, context) -> dict:
    """Геокодирует адреса объектов через geocode.maps.co и исправляет районы."""

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = body.get('action', 'preview')
    filter_ids = body.get('ids')

    api_key = os.environ.get('MAPS_CO_API_KEY', '')
    if not api_key:
        return _ok({'error': 'MAPS_CO_API_KEY не задан'}, 500)

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if filter_ids:
        ids_str = ','.join(str(i) for i in filter_ids)
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' "
            f"AND id IN ({ids_str}) ORDER BY id"
        )
    else:
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' "
            f"ORDER BY id"
        )

    rows = cur.fetchall()
    results = []
    errors = []

    for row in rows:
        lid = row['id']
        address = row['address']
        district_old = row['district']

        geo = _geocode_one(address, api_key)
        time.sleep(1.1)

        if 'error' in geo:
            errors.append({'id': lid, 'address': address, 'error': geo['error']})
            continue

        district_new = _detect_district(geo)

        entry = {
            'id': lid,
            'address': address,
            'district_old': district_old,
            'district_new': district_new,
            'osm_suburb': geo.get('suburb', ''),
            'osm_neighbourhood': geo.get('neighbourhood', ''),
            'osm_quarter': geo.get('quarter', ''),
            'changed': district_new is not None and district_new != district_old,
        }

        if action == 'apply' and district_new and district_new != district_old:
            dn = district_new.replace("'", "''")
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET district = '{dn}' WHERE id = {lid}"
            )

        results.append(entry)

    if action == 'apply':
        conn.commit()

    conn.close()

    changed = [r for r in results if r['changed']]
    not_detected = [r for r in results if not r['changed'] and r['district_new'] is None]

    return _ok({
        'action': action,
        'total': len(results),
        'changed_count': len(changed),
        'not_detected_count': len(not_detected),
        'error_count': len(errors),
        'changed': changed,
        'not_detected': not_detected,
        'errors': errors,
    })
