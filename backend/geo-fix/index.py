"""
Business: Геокодирование адресов объектов через DaData API и автоисправление района.
Запускается вручную: action=preview (показать что изменится) или action=apply (применить).
Args: event с body {action: 'preview'|'apply', ids?: [int, ...]}, X-Auth-Token; context
Returns: список изменений {id, address, district_old, district_new}
"""

import json
import os
import urllib.request
import urllib.error
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

# Карта: ключевые слова из city_district → название района в БД
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


def _geocode_one(address: str, api_key: str, secret_key: str) -> dict:
    """Стандартизирует один адрес через DaData."""
    payload = json.dumps([address], ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        'https://cleaner.dadata.ru/api/v1/clean/address',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Token {api_key}',
            'X-Secret': secret_key,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result[0] if result else {}
    except urllib.error.HTTPError as e:
        body = e.read(300).decode('utf-8', errors='replace')
        return {'error': f'HTTP {e.code}: {body[:150]}'}
    except Exception as e:
        return {'error': str(e)}


def _detect_district(search_str: str) -> str | None:
    """Определяет район из нашего справочника по строке поиска."""
    if not search_str:
        return None
    s = search_str.lower()
    for keyword, district_name in DISTRICT_MAP:
        if keyword.lower() in s:
            return district_name
    return None


def handler(event: dict, context) -> dict:
    """Стандартизирует адреса объектов через DaData и исправляет районы пакетно."""

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

    api_key = os.environ.get('DADATA_API_KEY', '')
    secret_key = os.environ.get('DADATA_SECRET_KEY', '')
    if not api_key or not secret_key:
        return _ok({'error': 'DADATA_API_KEY или DADATA_SECRET_KEY не заданы'}, 500)

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

        geo = _geocode_one(f'Краснодар, {address}', api_key, secret_key)

        if 'error' in geo:
            errors.append({'id': lid, 'address': address, 'error': geo['error']})
            continue

        city_district = geo.get('city_district', '') or ''
        city_area = geo.get('city_area', '') or ''
        settlement = geo.get('settlement_with_type', '') or ''
        qc = geo.get('qc', -1)

        if qc == 2:
            errors.append({'id': lid, 'address': address, 'error': 'Адрес не распознан DaData (qc=2)'})
            continue

        # DaData не заполняет city_district для Краснодара — ищем по всем текстовым полям
        search_str = ' '.join(filter(None, [city_district, city_area, settlement,
            geo.get('street', ''), geo.get('area', ''), geo.get('result', '')]))
        district_new = _detect_district(search_str)

        entry = {
            'id': lid,
            'address': address,
            'district_old': district_old,
            'district_new': district_new,
            'city_district': city_district,
            'city_area': city_area,
            'settlement': settlement,
            'geo_result': geo.get('result', ''),
            'qc': qc,
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