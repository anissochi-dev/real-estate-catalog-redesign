"""
Business: Приём заявок с сайта — форма обратной связи и заявки по объектам.
Args: event с httpMethod (POST), body {name, phone, email, message, listing_id}; context
Returns: HTTP-ответ с id созданной заявки или ошибкой валидации
"""

import json
import os
import threading
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

    # Лиды с сайта проходят модерацию: статус 'pending'
    # Внутренние лиды (created_by_admin, crm и др.) сразу 'new'
    SITE_SOURCES = ('site', 'property-page', 'offer-to-lead', 'callback', 'hero', 'catalog')
    initial_status = 'pending' if source in SITE_SOURCES else 'new'

    sql = (
        "INSERT INTO t_p71821556_real_estate_catalog_.leads "
        "(name, phone, email, message, listing_id, source, status) VALUES ("
        f"'{name_s}', '{phone_s}', {email_s}, {msg_s}, {listing_s}, '{source_s}', '{initial_status}'"
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

    # Асинхронно отправляем push всем подписанным администраторам
    if initial_status == 'pending':
        def _send_push_notifications():
            try:
                _notify_admins(name, phone, lead_id, dsn)
            except Exception:
                pass
        threading.Thread(target=_send_push_notifications, daemon=True).start()

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'success': True, 'id': lead_id}),
    }


def _notify_admins(name: str, phone: str, lead_id: int, dsn: str):
    """
    Отправляет push всем подписанным администраторам о новом лиде на модерации.
    VAPID-ключи берёт из БД (они генерируются автоматически при первом запросе push).
    """
    SCHEMA = 't_p71821556_real_estate_catalog_'

    conn2 = psycopg2.connect(dsn)
    try:
        with conn2.cursor() as cur2:
            # Загружаем VAPID-ключи из БД
            cur2.execute(
                f"SELECT vapid_public_key, vapid_private_key FROM {SCHEMA}.settings "
                f"ORDER BY id ASC LIMIT 1"
            )
            row = cur2.fetchone()
            if not row or not row[0] or not row[1]:
                return  # Ключи ещё не сгенерированы — тихо выходим
            vapid_public = row[0]
            vapid_private = row[1]

            cur2.execute(
                f"SELECT endpoint, p256dh, auth FROM {SCHEMA}.push_subscriptions "
                f"WHERE auth != 'removed'"
            )
            subs = cur2.fetchall()
    finally:
        conn2.close()

    if not subs:
        return

    try:
        from pywebpush import webpush
        payload = json.dumps({
            'title': '🔔 Новая заявка на модерации',
            'body': f'{name} · {phone}',
            'url': '/?admin=leads',
            'tag': f'lead-{lead_id}',
            'requireInteraction': True,
        }, ensure_ascii=False)
        for endpoint, p256dh, auth_key in subs:
            try:
                webpush(
                    subscription_info={'endpoint': endpoint, 'keys': {'p256dh': p256dh, 'auth': auth_key}},
                    data=payload,
                    vapid_private_key=vapid_private,
                    vapid_claims={'sub': 'mailto:noreply@biznest.ru'},
                )
            except Exception:
                pass
    except ImportError:
        pass


def _err(code: int, msg: str) -> dict:
    return {
        'statusCode': code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps({'error': msg}),
    }