"""
Business: Определение района объекта по справочнику улиц (таблица street_district_map) и автоисправление.
Запускается вручную: action=preview (показать что изменится) или action=apply (применить).
Args: event с body {action: 'preview'|'apply', ids?: [int, ...]}, X-Auth-Token; context
Returns: список изменений {id, address, district_old, district_new}
"""

import json
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _parse_address(address: str) -> tuple:
    """Извлекает название улицы и номер дома из адреса."""
    house_match = re.search(r',\s*(\d+)', address)
    house_num = int(house_match.group(1)) if house_match else None
    street = re.sub(r',?\s*\d+.*$', '', address).strip()
    street = re.sub(r'\s+(улица|проспект|шоссе|переулок|бульвар|аллея|проезд)$', '', street, flags=re.IGNORECASE).strip()
    return street, house_num


def _find_district(street: str, house_num, street_rules: list) -> str | None:
    """Ищет район по улице и номеру дома в справочнике."""
    street_lower = street.lower()
    best = None
    for rule in street_rules:
        pat = rule['street_pattern'].lower()
        if pat not in street_lower and pat != street_lower:
            continue
        h_from = rule['house_from']
        h_to = rule['house_to']
        # Без диапазона — общее правило (низкий приоритет)
        if h_from is None and h_to is None:
            if best is None:
                best = rule['district']
        # С диапазоном — точное правило (высокий приоритет)
        elif house_num is not None:
            if (h_from is None or house_num >= h_from) and (h_to is None or house_num <= h_to):
                return rule['district']
    return best


def handler(event: dict, context) -> dict:
    """Определяет районы объектов по справочнику улиц и исправляет их в БД."""

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

    # Загружаем весь справочник с диапазонами
    cur.execute(
        f"SELECT street_pattern, district, house_from, house_to "
        f"FROM {SCHEMA}.street_district_map ORDER BY id ASC"
    )
    street_rules = cur.fetchall()

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
    not_found = []

    for row in rows:
        lid = row['id']
        address = row['address']
        district_old = row['district']

        street, house_num = _parse_address(address)
        district_new = _find_district(street, house_num, street_rules)

        entry = {
            'id': lid,
            'address': address,
            'street': street,
            'district_old': district_old,
            'district_new': district_new,
            'changed': district_new is not None and district_new != district_old,
        }

        if action == 'apply' and district_new and district_new != district_old:
            dn = district_new.replace("'", "''")
            cur.execute(
                f"UPDATE {SCHEMA}.listings SET district = '{dn}' WHERE id = {lid}"
            )

        if district_new is None:
            not_found.append(entry)
        else:
            results.append(entry)

    if action == 'apply':
        conn.commit()

    conn.close()

    changed = [r for r in results if r['changed']]
    unchanged = [r for r in results if not r['changed']]

    return _ok({
        'action': action,
        'total': len(results) + len(not_found),
        'changed_count': len(changed),
        'unchanged_count': len(unchanged),
        'not_found_count': len(not_found),
        'changed': changed,
        'not_found': not_found,
    })