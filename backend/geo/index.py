"""
Геолокация и адреса: подсказки DaData и исправление районов.

action=suggest   GET  ?query=Красная&city=Краснодар
                 → [{value, full, lat, lon, district}]

action=fix       POST {action: 'fix', mode: 'preview'|'apply', ids?: [int,...]}
                 → {changed_count, not_found_count, changed: [...]}

Общая логика: справочник street_district_map → определение микрорайона.
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def _ok(body, status=200):
    return {'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(msg, status=400):
    return _ok({'error': msg}, status)


# ── Общая логика справочника ──────────────────────────────────────────────────

def _load_street_rules(cur) -> list:
    cur.execute(
        f"SELECT street_pattern, district, house_from, house_to "
        f"FROM {SCHEMA}.street_district_map ORDER BY id ASC"
    )
    return cur.fetchall()


def _find_district(street: str, house_num, rules: list) -> str | None:
    """Ищет микрорайон по улице и номеру дома."""
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
    return best


# ── action=suggest ────────────────────────────────────────────────────────────

def _handle_suggest(event: dict, cur) -> dict:
    params = event.get('queryStringParameters') or {}
    query = params.get('query', '').strip()
    city = params.get('city', 'Краснодар').strip()

    if not query:
        return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
                'body': json.dumps([], ensure_ascii=False)}

    api_key = os.environ.get('DADATA_API_KEY', '')
    secret_key = os.environ.get('DADATA_SECRET_KEY', '')

    payload = json.dumps({
        'query': f'{city}, {query}', 'count': 8,
        'locations': [{'city': city}], 'restrict_value': False,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
        data=payload,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                 'Authorization': f'Token {api_key}', 'X-Secret': secret_key},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    rules = _load_street_rules(cur)
    suggestions = []
    for s in data.get('suggestions', []):
        value = s.get('value', '')
        d = s.get('data', {})
        street = d.get('street', '') or ''
        house_str = d.get('house', '') or ''
        m = re.match(r'(\d+)', house_str)
        house_num = int(m.group(1)) if m else None
        district = _find_district(street, house_num, rules) or ''

        short = value
        for prefix in ['Россия, ', 'Краснодарский край, ', f'г {city}, ', f'{city}, ']:
            while short.startswith(prefix):
                short = short[len(prefix):]

        suggestions.append({
            'value': short, 'full': value,
            'lat': float(d['geo_lat']) if d.get('geo_lat') else None,
            'lon': float(d['geo_lon']) if d.get('geo_lon') else None,
            'district': district,
        })

    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(suggestions, ensure_ascii=False)}


# ── action=fix ────────────────────────────────────────────────────────────────

def _parse_address(address: str) -> tuple:
    house_match = re.search(r',\s*(\d+)', address)
    house_num = int(house_match.group(1)) if house_match else None
    street = re.sub(r',?\s*\d+.*$', '', address).strip()
    street = re.sub(r'\s+(улица|проспект|шоссе|переулок|бульвар|аллея|проезд)$', '', street, flags=re.IGNORECASE).strip()
    return street, house_num


def _handle_fix(body: dict, cur, conn) -> dict:
    mode = body.get('mode') or body.get('action_mode', 'preview')
    filter_ids = body.get('ids')

    rules = _load_street_rules(cur)

    if filter_ids:
        ids_str = ','.join(str(i) for i in filter_ids)
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' AND id IN ({ids_str}) ORDER BY id"
        )
    else:
        cur.execute(
            f"SELECT id, address, district FROM {SCHEMA}.listings "
            f"WHERE status = 'active' AND address IS NOT NULL AND address != '' ORDER BY id"
        )

    results, not_found = [], []
    for row in cur.fetchall():
        lid, address, district_old = row['id'], row['address'], row['district']
        street, house_num = _parse_address(address)
        district_new = _find_district(street, house_num, rules)

        entry = {'id': lid, 'address': address, 'street': street,
                 'district_old': district_old, 'district_new': district_new,
                 'changed': district_new is not None and district_new != district_old}

        if mode == 'apply' and district_new and district_new != district_old:
            dn = district_new.replace("'", "''")
            cur.execute(f"UPDATE {SCHEMA}.listings SET district = '{dn}' WHERE id = {lid}")

        (results if district_new is not None else not_found).append(entry)

    if mode == 'apply':
        conn.commit()

    changed = [r for r in results if r['changed']]
    return _ok({
        'mode': mode,
        'total': len(results) + len(not_found),
        'changed_count': len(changed),
        'unchanged_count': len(results) - len(changed),
        'not_found_count': len(not_found),
        'changed': changed,
        'not_found': not_found,
    })


# ── Handler ───────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    # Определяем action: из query-строки, тела или по HTTP-методу
    action = params.get('action') or body.get('action') or (
        'suggest' if event.get('httpMethod') == 'GET' else 'fix'
    )

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if action == 'suggest':
                return _handle_suggest(event, cur)
            elif action == 'fix':
                return _handle_fix(body, cur, conn)
            else:
                return _err(f'Неизвестный action: {action}. Доступные: suggest, fix')
    finally:
        conn.close()
