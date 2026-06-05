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


def _extract_street(address: str) -> str:
    """Извлекает название улицы из адреса — убирает номер дома и тип улицы."""
    # Убираем номер дома: ", 123к4" или ", 12/5" и т.д.
    street = re.sub(r',?\s*\d+.*$', '', address).strip()
    # Убираем тип улицы в конце: "улица", "проспект", "шоссе", "переулок", "бульвар", "набережная"
    street = re.sub(r'\s+(улица|проспект|шоссе|переулок|бульвар|аллея|проезд)$', '', street, flags=re.IGNORECASE).strip()
    return street


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

    # Загружаем справочник улиц (первая запись на каждый паттерн — приоритетная)
    cur.execute(
        f"SELECT DISTINCT ON (street_pattern) street_pattern, district "
        f"FROM {SCHEMA}.street_district_map "
        f"ORDER BY street_pattern, id ASC"
    )
    street_map = {row['street_pattern'].lower(): row['district'] for row in cur.fetchall()}

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

        street = _extract_street(address)
        street_lower = street.lower()

        # Точное совпадение
        district_new = street_map.get(street_lower)

        # Если не нашли точно — ищем по вхождению паттерна в адрес
        if not district_new:
            for pattern, district in street_map.items():
                if pattern in street_lower:
                    district_new = district
                    break

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
