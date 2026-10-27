"""
Управление метками телефонных номеров (плохой собственник / конкурент).
GET  ?phones=79001234567,79009876543  — проверить номера по флагам (все авторизованные)
POST {phone, flag_type, comment}      — поставить метку (admin/director)
DELETE ?phone=79001234567             — снять метку (admin/director)
"""
import json
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
    'Access-Control-Max-Age': '86400',
}


def _ok(data, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, default=str, ensure_ascii=False)}


def _err(status, msg):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _normalize(phone):
    if not phone:
        return ''
    digits = re.sub(r'[^0-9]', '', str(phone))
    if len(digits) == 11 and digits.startswith('8'):
        digits = '7' + digits[1:]
    return digits


def _get_user(token, conn):
    if not token:
        return None
    t = token.replace("'", "''")[:100]
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"SELECT u.id, u.name, u.role FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
        )
        return cur.fetchone()


def handler(event: dict, context) -> dict:
    """Флаги телефонных номеров: проверка, постановка, снятие."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    headers = event.get('headers') or {}
    raw_token = (
        headers.get('X-Auth-Token') or headers.get('x-auth-token') or
        headers.get('X-Authorization') or headers.get('x-authorization') or ''
    )
    token = raw_token.replace('Bearer ', '').strip()

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        # ── GET: проверить список номеров ──────────────────────────────────
        if method == 'GET':
            params = event.get('queryStringParameters') or {}
            phones_raw = (params.get('phones') or '').split(',')
            phones = [_normalize(p) for p in phones_raw if p.strip()]
            if not phones:
                return _err(400, 'Укажи параметр phones')

            placeholders = ','.join([f"'{p}'" for p in phones if p])
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT phone, flag_type, comment, created_by_name, created_at "
                    f"FROM {SCHEMA}.phone_flags "
                    f"WHERE phone IN ({placeholders}) AND is_active = TRUE "
                    f"ORDER BY created_at DESC"
                )
                rows = cur.fetchall()

            result = {}
            for row in rows:
                p = row['phone']
                if p not in result:
                    result[p] = {
                        'phone': p,
                        'flag_type': row['flag_type'],
                        'comment': row['comment'],
                        'created_by_name': row['created_by_name'],
                        'created_at': str(row['created_at']),
                    }
            return _ok({'flags': result})

        # ── POST: поставить метку ─────────────────────────────────────────
        if method == 'POST':
            user = _get_user(token, conn)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'director'):
                return _err(403, 'Только admin или director могут ставить метки')

            body = json.loads(event.get('body') or '{}')
            phone = _normalize(body.get('phone', ''))
            flag_type = body.get('flag_type', '')
            comment = (body.get('comment') or '').strip()[:300]

            if not phone:
                return _err(400, 'Укажи phone')
            if flag_type not in ('bad_owner', 'competitor'):
                return _err(400, 'flag_type должен быть bad_owner или competitor')

            ph = phone.replace("'", "''")
            ft = flag_type.replace("'", "''")
            cm = comment.replace("'", "''")
            uname = (user.get('name') or '').replace("'", "''")
            uid = int(user['id'])

            with conn.cursor() as cur:
                # Деактивируем старые флаги этого номера
                cur.execute(
                    f"UPDATE {SCHEMA}.phone_flags SET is_active = FALSE "
                    f"WHERE phone = '{ph}' AND is_active = TRUE"
                )
                cur.execute(
                    f"INSERT INTO {SCHEMA}.phone_flags (phone, flag_type, comment, created_by, created_by_name) "
                    f"VALUES ('{ph}', '{ft}', '{cm}', {uid}, '{uname}')"
                )
            conn.commit()
            return _ok({'success': True})

        # ── DELETE: снять метку ────────────────────────────────────────────
        if method == 'DELETE':
            user = _get_user(token, conn)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'director'):
                return _err(403, 'Только admin или director могут снимать метки')

            params = event.get('queryStringParameters') or {}
            phone = _normalize(params.get('phone', ''))
            if not phone:
                return _err(400, 'Укажи phone')

            ph = phone.replace("'", "''")
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.phone_flags SET is_active = FALSE "
                    f"WHERE phone = '{ph}' AND is_active = TRUE"
                )
            conn.commit()
            return _ok({'success': True})

        return _err(405, 'Method not allowed')
    finally:
        conn.close()