"""
Business: Геокодирование адресов объектов через Nominatim (OpenStreetMap) и автоисправление района.
Запускается вручную: action=preview (показать что изменится) или action=apply (применить).
Args: event с body {action: 'preview'|'apply', ids?: [int, ...]}, X-Auth-Token; context
Returns: список изменений {id, address, district_old, district_new}
"""

import json
import os
import time
import urllib.request
import urllib.parse
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

# Карта: ключевые слова из ответа геокодера → название района в БД
# Порядок важен: более специфичные — выше
DISTRICT_MAP = [
    # Пашковский с/о — Карасунский округ
    ('Пашковский', 'Пашковский (ПМР)'),
    # Карасунский округ
    ('Фестивальный', 'Фестивальный (ФМР)'),
    ('Юбилейный', 'Юбилейный (ЮМР)'),
    ('Черёмушки', 'Черёмушки (ЧМР)'),
    ('Комсомольский', 'Комсомольский (КМР)'),
    ('Школьный', 'Школьный (ШМР)'),
    ('Славянский', 'Славянский (СМР)'),
    ('Музыкальный', 'Музыкальный'),
    ('Микрохирургия', 'Микрохирургия глаза (МХГ)'),
    ('Панорама', 'Панорама (Стадион Краснодар)'),
    # Прикубанский округ
    ('Гидростроителей', 'Гидростроителей (ГМР)'),
    ('Губернский', 'Губернский'),
    ('Немецкая деревня', 'Немецкая деревня'),
    ('Авиагородок', 'Авиагородок'),
    ('Молодёжный', 'Молодёжный'),
    ('Жукова', 'Энка (Жукова)'),
    ('Лазурный', 'Лазурный п.'),
    ('Российский', 'Российский п.'),
    ('Победитель', 'Победитель п.'),
    ('Плодородный', 'Плодородный п.'),
    ('Краснодарский', 'Краснодарский п.'),
    ('Индустриальный', 'Индустриальный п.'),
    ('Берёзовый', 'Берёзовый п.'),
    ('Колосистый', 'Колосистый п.'),
    ('Зиповский', 'Завод измерительных приборов (ЗИП)'),
    ('Елизаветинск', 'Индустриальный п.'),
    # Западный округ
    ('Кожевенный', 'Кожевенный завод (Кожзавод)'),
    # Центральный округ — последний
    ('Центральный', 'Центральный (ЦМР)'),
]


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _geocode_nominatim(address: str) -> dict | None:
    """Геокодирует адрес через Nominatim (OSM). Возвращает словарь с полями адреса."""
    query = urllib.parse.urlencode({
        'q': f'Краснодар, {address}',
        'format': 'json',
        'addressdetails': 1,
        'limit': 1,
        'countrycodes': 'ru',
        'accept-language': 'ru',
    })
    url = f'https://nominatim.openstreetmap.org/search?{query}'
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'biznest-geocoder/1.0 (krasnodar real estate)'}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        if not data:
            return None
        item = data[0]
        addr = item.get('address', {})
        return {
            'display_name': item.get('display_name', ''),
            'suburb': addr.get('suburb', ''),
            'quarter': addr.get('quarter', ''),
            'neighbourhood': addr.get('neighbourhood', ''),
            'city_district': addr.get('city_district', ''),
            'road': addr.get('road', ''),
        }
    except Exception as e:
        return {'error': str(e)}


def _detect_district(geo: dict) -> str | None:
    """Определяет район из нашего справочника по данным геокодера."""
    if not geo or 'error' in geo:
        return None
    search_str = ' '.join([
        geo.get('suburb', ''),
        geo.get('quarter', ''),
        geo.get('neighbourhood', ''),
        geo.get('city_district', ''),
        geo.get('display_name', ''),
    ])
    for keyword, district_name in DISTRICT_MAP:
        if keyword.lower() in search_str.lower():
            return district_name
    return None


def handler(event: dict, context) -> dict:
    """Геокодирует адреса объектов через OpenStreetMap и исправляет районы."""

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

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if filter_ids:
        ids_str = ','.join(str(i) for i in filter_ids)
        cur.execute(
            f"SELECT id, title, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' "
            f"AND id IN ({ids_str}) ORDER BY id"
        )
    else:
        cur.execute(
            f"SELECT id, title, address, district FROM {SCHEMA}.listings "
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

        geo = _geocode_nominatim(address)
        time.sleep(1.1)  # Nominatim: не более 1 запроса в секунду

        if geo and 'error' in geo:
            errors.append({'id': lid, 'address': address, 'error': geo['error']})
            continue

        district_new = _detect_district(geo)

        entry = {
            'id': lid,
            'address': address,
            'district_old': district_old,
            'district_new': district_new,
            'geo_suburb': geo.get('suburb', '') if geo else '',
            'geo_quarter': geo.get('quarter', '') if geo else '',
            'geo_display': (geo.get('display_name', '') if geo else '')[:120],
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
    not_detected = [r for r in results if r['district_new'] is None]

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
