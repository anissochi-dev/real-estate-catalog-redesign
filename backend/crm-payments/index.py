"""
Платёжный модуль: генерация ссылок на оплату через ЮКассу.
Создание платежей, вебхук, возврат средств, проверка статуса.
"""
import json
import os
import uuid
import hmac
import hashlib
import urllib.request
import base64
import psycopg2
import psycopg2.extras


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
}

ALLOWED_ROLES = ('admin', 'director', 'broker', 'office_manager', 'manager')

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 'public')


def get_conn():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.cursor_factory = psycopg2.extras.RealDictCursor
    return conn


def _load_yookassa_keys(cur):
    """Читает ключи ЮКассы из таблицы settings; fallback на переменные окружения."""
    try:
        cur.execute(
            f"SELECT yookassa_shop_id, yookassa_secret_key "
            f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            shop = (row.get('yookassa_shop_id') or '').strip()
            key = (row.get('yookassa_secret_key') or '').strip()
            if shop and key:
                return shop, key
    except Exception:
        pass
    return (
        os.environ.get('YOOKASSA_SHOP_ID', ''),
        os.environ.get('YOOKASSA_SECRET_KEY', ''),
    )


def ok(data, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(data, default=str),
    }


def err(msg, status=400):
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}),
    }


def get_user(token, conn):
    if not token:
        return None
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.name, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = TRUE",
        (token,)
    )
    row = cur.fetchone()
    return dict(row) if row else None


def yk_request(method, path, payload, shop_id, secret_key, idempotency_key=None):
    credentials = base64.b64encode(f'{shop_id}:{secret_key}'.encode()).decode()
    headers = {
        'Authorization': f'Basic {credentials}',
        'Content-Type': 'application/json',
    }
    if idempotency_key:
        headers['Idempotence-Key'] = idempotency_key
    data = json.dumps(payload).encode('utf-8') if payload else None
    req = urllib.request.Request(
        f'https://api.yookassa.ru/v3/{path}',
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')
    path_parts = [p for p in path.split('/') if p]
    qs = event.get('queryStringParameters') or {}
    body = json.loads(event['body']) if event.get('body') else {}

    # ── Вебхук ЮКассы (без авторизации) ──────────────────────────────────
    if path.rstrip('/').endswith('webhook') or qs.get('action') == 'webhook':
        return _handle_webhook(body, event)

    token = (event.get('headers') or {}).get('x-auth-token') or \
            (event.get('headers') or {}).get('X-Auth-Token')

    conn = get_conn()
    user = get_user(token, conn)

    if not user or user['role'] not in ALLOWED_ROLES:
        conn.close()
        return err('Нет доступа', 403)

    resource_id = int(path_parts[0]) if path_parts and path_parts[0].isdigit() else None
    action = qs.get('action') or (path_parts[1] if len(path_parts) > 1 else None)

    cur = conn.cursor()
    shop_id, secret_key = _load_yookassa_keys(cur)

    # ── GET /?action=ping  — проверка ключей ЮКассы ──────────────────────
    if method == 'GET' and action == 'ping':
        test_shop = (qs.get('shop_id') or shop_id).strip()
        test_key = (qs.get('secret_key') or secret_key).strip()
        if not test_shop or not test_key:
            conn.close()
            return err('Ключи ЮКассы не настроены')
        try:
            result = yk_request('GET', 'me', None, test_shop, test_key)
            conn.close()
            return ok({
                'success': True,
                'account_id': result.get('account_id'),
                'status': result.get('status'),
                'test': result.get('test', False),
            })
        except Exception as e:
            conn.close()
            msg = str(e)
            if hasattr(e, 'read'):
                try:
                    msg = e.read().decode('utf-8', errors='ignore')[:300]
                except Exception:
                    pass
            return err(f'ЮКасса: {msg[:300]}', 502)

    # ── GET /  — список платежей ──────────────────────────────────────────
    if method == 'GET' and not resource_id:
        page = max(1, int(qs.get('page', 1)))
        limit = min(100, int(qs.get('limit', 30)))
        offset = (page - 1) * limit
        payment_type = qs.get('payment_type')
        status_filter = qs.get('status')

        where = []
        if payment_type:
            where.append(f"p.payment_type = '{payment_type}'")
        if status_filter:
            where.append(f"p.status = '{status_filter}'")
        where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

        cur.execute(f"""
            SELECT p.id, p.deal_id, d.title AS deal_title,
                   p.owner_id, o.name AS owner_name,
                   p.amount, p.description, p.payment_type,
                   p.buyer_email, p.buyer_phone,
                   p.yookassa_payment_id, p.yookassa_url,
                   p.status, p.refund_status,
                   p.created_at, p.updated_at, u.name AS creator
            FROM {SCHEMA}.crm_payments p
            LEFT JOIN {SCHEMA}.crm_deals d ON d.id = p.deal_id
            LEFT JOIN {SCHEMA}.crm_owners o ON o.id = p.owner_id
            LEFT JOIN {SCHEMA}.users u ON u.id = p.created_by
            {where_sql}
            ORDER BY p.created_at DESC LIMIT %s OFFSET %s
        """, (limit, offset))
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.crm_payments p {where_sql}")
        total = cur.fetchone()['c']
        conn.close()
        return ok({'payments': rows, 'total': total, 'page': page, 'pages': -(-total // limit)})

    # ── GET /{id}  — проверка статуса ─────────────────────────────────────
    if method == 'GET' and resource_id:
        cur.execute(
            f"SELECT * FROM {SCHEMA}.crm_payments WHERE id = %s", (resource_id,)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err('Не найдено', 404)
        p = dict(row)
        if p.get('yookassa_payment_id') and p['status'] == 'pending' and shop_id and secret_key:
            try:
                yk = yk_request('GET', f"payments/{p['yookassa_payment_id']}", None, shop_id, secret_key)
                new_status = yk.get('status', p['status'])
                if new_status != p['status']:
                    cur.execute(
                        f"UPDATE {SCHEMA}.crm_payments SET status=%s, updated_at=NOW() WHERE id=%s",
                        (new_status, resource_id)
                    )
                    conn.commit()
                    p['status'] = new_status
            except Exception:
                pass
        conn.close()
        return ok({'payment': p})

    # ── POST /  — создать платёж ──────────────────────────────────────────
    if method == 'POST' and not resource_id:
        amount = body.get('amount')
        if not amount or float(amount) <= 0:
            conn.close()
            return err('Сумма обязательна')

        description = str(body.get('description') or 'Оплата услуг агентства')[:128]
        payment_type = str(body.get('payment_type') or 'service')
        buyer_email = body.get('buyer_email') or None
        buyer_phone = body.get('buyer_phone') or None
        return_url = str(body.get('return_url') or 'https://yookassa.ru')
        deal_id = body.get('deal_id') or None
        owner_id = body.get('owner_id') or None

        yookassa_url = None
        yookassa_payment_id = None

        if shop_id and secret_key:
            payload = {
                'amount': {'value': f'{float(amount):.2f}', 'currency': 'RUB'},
                'confirmation': {'type': 'redirect', 'return_url': return_url},
                'capture': True,
                'description': description,
            }
            if buyer_email:
                payload['receipt'] = {
                    'customer': {'email': buyer_email},
                    'items': [{
                        'description': description,
                        'quantity': '1.00',
                        'amount': {'value': f'{float(amount):.2f}', 'currency': 'RUB'},
                        'vat_code': 1,
                    }],
                }
            yk = yk_request('POST', 'payments', payload, shop_id, secret_key, str(uuid.uuid4()))
            yookassa_payment_id = yk.get('id')
            yookassa_url = yk.get('confirmation', {}).get('confirmation_url')
            if not yookassa_url:
                conn.close()
                return err(f"ЮКасса не вернула ссылку: {yk.get('description','')}")
        else:
            yookassa_url = f'https://yookassa.ru/demo/payment?amount={amount}'

        cur.execute(
            f"""INSERT INTO {SCHEMA}.crm_payments
                (deal_id, owner_id, amount, description, payment_type,
                 buyer_email, buyer_phone,
                 yookassa_payment_id, yookassa_url, created_by)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (deal_id, owner_id, float(amount), description, payment_type,
             buyer_email, buyer_phone,
             yookassa_payment_id, yookassa_url, user['id'])
        )
        new_id = cur.fetchone()['id']
        conn.commit()
        conn.close()
        return ok({'id': new_id, 'payment_url': yookassa_url, 'yookassa_payment_id': yookassa_payment_id}, 201)

    # ── POST /{id}/refund  — возврат ──────────────────────────────────────
    if method == 'POST' and resource_id and action == 'refund':
        cur.execute(
            f"SELECT * FROM {SCHEMA}.crm_payments WHERE id = %s", (resource_id,)
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err('Не найдено', 404)
        p = dict(row)
        if p['status'] != 'succeeded':
            conn.close()
            return err('Возврат возможен только для успешных платежей')
        if p.get('refund_status') == 'succeeded':
            conn.close()
            return err('Возврат уже был выполнен')
        if not shop_id or not secret_key:
            conn.close()
            return err('ЮКасса не настроена')

        refund_amount = body.get('amount') or p['amount']
        payload = {
            'payment_id': p['yookassa_payment_id'],
            'amount': {'value': f'{float(refund_amount):.2f}', 'currency': 'RUB'},
        }
        yk = yk_request('POST', 'refunds', payload, shop_id, secret_key, str(uuid.uuid4()))
        refund_id = yk.get('id')
        refund_status = yk.get('status', 'pending')

        cur.execute(
            f"UPDATE {SCHEMA}.crm_payments SET refund_id=%s, refund_status=%s, updated_at=NOW() WHERE id=%s",
            (refund_id, refund_status, resource_id)
        )
        conn.commit()
        conn.close()
        return ok({'refund_id': refund_id, 'status': refund_status})

    conn.close()
    return err('Неверный запрос')


def _handle_webhook(body, event):
    """Обработка вебхука ЮКассы — обновление статуса платежа."""
    event_type = body.get('event', '')
    obj = body.get('object', {})
    payment_id = obj.get('id')
    new_status = obj.get('status')

    if not payment_id or not new_status:
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': 'ok'}

    conn = get_conn()
    cur = conn.cursor()

    if 'payment' in event_type:
        cur.execute(
            f"UPDATE {os.environ.get('MAIN_DB_SCHEMA','public')}.crm_payments "
            f"SET status=%s, updated_at=NOW() WHERE yookassa_payment_id=%s",
            (new_status, payment_id)
        )
    elif 'refund' in event_type:
        refund_status = new_status
        refund_id = payment_id
        payment_yk_id = obj.get('payment_id')
        cur.execute(
            f"UPDATE {os.environ.get('MAIN_DB_SCHEMA','public')}.crm_payments "
            f"SET refund_id=%s, refund_status=%s, updated_at=NOW() WHERE yookassa_payment_id=%s",
            (refund_id, refund_status, payment_yk_id)
        )

    conn.commit()
    conn.close()
    return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': 'ok'}