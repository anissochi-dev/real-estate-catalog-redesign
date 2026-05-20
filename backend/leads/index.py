"""
Business: Приём заявок с сайта — форма обратной связи и заявки по объектам.
Args: event с httpMethod (POST), body {name, phone, email, message, listing_id}; context
Returns: HTTP-ответ с id созданной заявки или ошибкой валидации
"""

import json
import os
import psycopg2


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return {
            'statusCode': 405,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'Method not allowed'}),
        }

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _err(400, 'Invalid JSON')

    name = (body.get('name') or '').strip()
    phone = (body.get('phone') or '').strip()
    email = (body.get('email') or '').strip() or None
    message = (body.get('message') or '').strip() or None
    listing_id = body.get('listing_id')
    source = (body.get('source') or 'site').strip()

    if not name or not phone:
        return _err(400, 'Name and phone required')

    name_s = name.replace("'", "''")[:100]
    phone_s = phone.replace("'", "''")[:30]
    email_s = "NULL" if email is None else "'" + email.replace("'", "''")[:100] + "'"
    msg_s = "NULL" if message is None else "'" + message.replace("'", "''") + "'"
    listing_s = "NULL"
    if listing_id is not None:
        try:
            listing_s = str(int(listing_id))
        except (ValueError, TypeError):
            listing_s = "NULL"
    source_s = source.replace("'", "''")[:50]

    sql = (
        "INSERT INTO t_p71821556_real_estate_catalog_.leads "
        "(name, phone, email, message, listing_id, source) VALUES ("
        f"'{name_s}', '{phone_s}', {email_s}, {msg_s}, {listing_s}, '{source_s}'"
        ") RETURNING id"
    )

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            lead_id = cur.fetchone()[0]
            conn.commit()
    finally:
        conn.close()

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'success': True, 'id': lead_id}),
    }


def _err(code: int, msg: str) -> dict:
    return {
        'statusCode': code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'error': msg}),
    }
