"""
Business: Геокодирование адресов объектов через 2GIS API и автоисправление района.
Запускается вручную: action=preview (показать что изменится) или action=apply (применить).
Args: event с body {action: 'preview'|'apply', ids?: [int, ...]}, X-Auth-Token; context
Returns: список изменений {id, address, district_old, district_new}
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

# Карта: ключевые слова из ответа геокодера → название района в БД
DISTRICT_MAP = [
    # Карасунский округ
    ('Пашковский', 'Пашковский (ПМР)'),
    ('Фестивальный', 'Фестивальный (ФМР)'),
    ('Юбилейный', 'Юбилейный (ЮМР)'),
    ('Черёмушки', 'Черёмушки (ЧМР)'),
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
    ('Жукова', 'Энка (Жукова)'),
    ('Энка', 'Энка (Жукова)'),
    ('Лазурный', 'Лазурный п.'),
    ('Российский', 'Российский п.'),
    ('Победитель', 'Победитель п.'),
    ('Плодородный', 'Плодородный п.'),
    ('Краснодарский', 'Краснодарский п.'),
    ('Индустриальный', 'Индустриальный п.'),
    ('Берёзовый', 'Берёзовый п.'),
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
    ('СХИ', 'Сельскохозяйственный институт (СХИ)'),
    ('Сельскохозяйственный', 'Сельскохозяйственный институт (СХИ)'),
    # Центральный округ
    ('Табачная', 'Табачная фабрика (Табачка)'),
    ('ХБК', 'Хлопчато-бумажный комбинат (ХБК)'),
    ('Хлопчато', 'Хлопчато-бумажный комбинат (ХБК)'),
    ('Центральный', 'Центральный (ЦМР)'),
]


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _geocode_2gis(address: str, api_key: str) -> dict | None:
    """Геокодирует адрес через 2GIS API. Возвращает словарь с полями адреса."""
    query = urllib.parse.urlencode({
        'q': f'Краснодар, {address}',
        'fields': 'items.adm_div,items.address,items.full_name',
        'key': api_key,
        'locale': 'ru_RU',
        'limit': 1,
    })
    url = f'https://catalog.api.2gis.com/3.0/items/geocode?{query}'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'biznest-geocoder/1.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())

        items = data.get('result', {}).get('items', [])
        if not items:
            return None

        item = items[0]
        adm_div = item.get('adm_div', [])

        result = {
            'full_name': item.get('full_name', ''),
            'adm_div_names': ' '.join(d.get('name', '') for d in adm_div),
        }
        for div in adm_div:
            div_type = div.get('type', '')
            result[div_type] = div.get('name', '')

        return result
    except urllib.error.HTTPError as e:
        body = e.read(500).decode('utf-8', errors='replace')
        return {'error': f'HTTP {e.code}: {body[:200]}'}
    except Exception as e:
        return {'error': str(e)}


def _detect_district(geo: dict) -> str | None:
    """Определяет район из нашего справочника по данным геокодера."""
    if not geo or 'error' in geo:
        return None

    search_parts = []
    for val in geo.values():
        if isinstance(val, str):
            search_parts.append(val)

    search_str = ' '.join(search_parts)

    for keyword, district_name in DISTRICT_MAP:
        if keyword.lower() in search_str.lower():
            return district_name
    return None


def handler(event: dict, context) -> dict:
    """Геокодирует адреса объектов через 2GIS API и исправляет районы."""

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

    api_key = os.environ.get('TWOGIS_API_KEY', '')
    if not api_key:
        return _ok({'error': 'TWOGIS_API_KEY не задан'}, 500)

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

        geo = _geocode_2gis(address, api_key)

        if geo and 'error' in geo:
            errors.append({'id': lid, 'address': address, 'error': geo['error']})
            continue

        district_new = _detect_district(geo)

        entry = {
            'id': lid,
            'address': address,
            'district_old': district_old,
            'district_new': district_new,
            'geo_adm_div': geo.get('adm_div_names', '') if geo else '',
            'geo_full_name': (geo.get('full_name', '') if geo else '')[:120],
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
