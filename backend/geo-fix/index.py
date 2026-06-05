"""
Business: Геокодирование адресов объектов через Яндекс Геокодер (v4) и автоисправление района.
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
# Порядок важен: более специфичные — выше
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


def _geocode_yandex(address: str, api_key: str) -> dict | None:
    """Геокодирует адрес через Яндекс Геокодер. Возвращает словарь с полями адреса."""
    query = urllib.parse.urlencode({
        'apikey': api_key,
        'geocode': f'Краснодар, {address}',
        'format': 'json',
        'results': 1,
        'lang': 'ru_RU',
    })
    url = f'https://geocode-maps.yandex.ru/1.x/?{query}'
    try:
        req = urllib.request.Request(url, headers={
            'Referer': 'https://biznest.ru',
            'User-Agent': 'Mozilla/5.0',
        })
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())

        members = (
            data
            .get('response', {})
            .get('GeoObjectCollection', {})
            .get('featureMember', [])
        )
        if not members:
            return None

        geo_obj = members[0].get('GeoObject', {})
        meta = geo_obj.get('metaDataProperty', {}).get('GeocoderMetaData', {})
        address_meta = meta.get('Address', {})
        components = address_meta.get('Components', [])

        result = {
            'display_name': geo_obj.get('description', '') + ' ' + geo_obj.get('name', ''),
            'kind': meta.get('kind', ''),
            'precision': meta.get('precision', ''),
        }

        for comp in components:
            kind = comp.get('kind', '')
            name = comp.get('name', '')
            result[kind] = name

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

    # Яндекс возвращает district, locality_name, display_name
    search_parts = [
        geo.get('district', ''),
        geo.get('locality', ''),
        geo.get('display_name', ''),
        geo.get('Street', ''),
    ]
    # Также ищем по всем компонентам
    for key, val in geo.items():
        if isinstance(val, str):
            search_parts.append(val)

    search_str = ' '.join(search_parts)

    for keyword, district_name in DISTRICT_MAP:
        if keyword.lower() in search_str.lower():
            return district_name
    return None


def handler(event: dict, context) -> dict:
    """Геокодирует адреса объектов через Яндекс Геокодер и исправляет районы."""

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

    api_key = os.environ.get('YANDEX_GEOCODER_KEY', '')
    if not api_key:
        return _ok({'error': 'YANDEX_GEOCODER_KEY не задан'}, 500)

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

        geo = _geocode_yandex(address, api_key)

        if geo and 'error' in geo:
            errors.append({'id': lid, 'address': address, 'error': geo['error']})
            continue

        district_new = _detect_district(geo)

        entry = {
            'id': lid,
            'address': address,
            'district_old': district_old,
            'district_new': district_new,
            'geo_district': geo.get('district', '') if geo else '',
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