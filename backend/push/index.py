"""
Push-уведомления для администраторов.
VAPID-ключи генерируются автоматически на сервере при первом запуске и хранятся в БД.
Приватный ключ никогда не передаётся клиенту.
Args: POST {action: subscribe|unsubscribe|send|vapid_public|check|init}, headers X-Auth-Token
Returns: {ok} или {vapid_public_key}
"""
import base64
import hashlib
import json
import os
import struct
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
ADMIN_ROLES = ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager')


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=255):
    return (s or '').replace("'", "''")[:length]


def _get_user(cur, token):
    if not token:
        return None
    t = _safe(token, 100)
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
    )
    return cur.fetchone()


def _generate_vapid_keys() -> tuple[str, str]:
    """
    Генерирует пару VAPID-ключей (EC P-256) без внешних зависимостей.
    Использует cryptography из стандартного окружения Python.
    Возвращает (public_key_base64url, private_key_base64url).
    """
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption
    )
    from cryptography.hazmat.backends import default_backend

    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    # Приватный ключ в формате PKCS8 DER → base64url
    priv_der = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
    priv_b64 = base64.urlsafe_b64encode(priv_der).rstrip(b'=').decode('ascii')

    # Публичный ключ в uncompressed point format (04 || x || y) → base64url
    pub_der = public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    pub_b64 = base64.urlsafe_b64encode(pub_der).rstrip(b'=').decode('ascii')

    return pub_b64, priv_b64


def _load_vapid_keys(cur) -> tuple[str, str]:
    """Загружает VAPID-ключи из БД. Если нет — генерирует и сохраняет."""
    cur.execute(f"SELECT vapid_public_key, vapid_private_key FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    row = cur.fetchone()
    if row and row.get('vapid_public_key') and row.get('vapid_private_key'):
        return row['vapid_public_key'], row['vapid_private_key']

    # Ключей нет — генерируем прямо сейчас
    pub, priv = _generate_vapid_keys()
    pub_s = _safe(pub, 500)
    priv_s = _safe(priv, 500)
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET "
        f"vapid_public_key = '{pub_s}', vapid_private_key = '{priv_s}', updated_at = NOW() "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
    )
    return pub, priv


def _send_push_notification(sub_endpoint: str, sub_p256dh: str, sub_auth: str,
                             payload: dict, vapid_private: str, vapid_public: str) -> bool:
    """Отправляет одно push-уведомление через pywebpush."""
    try:
        from pywebpush import webpush
        webpush(
            subscription_info={
                'endpoint': sub_endpoint,
                'keys': {'p256dh': sub_p256dh, 'auth': sub_auth},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=vapid_private,
            vapid_claims={'sub': 'mailto:noreply@biznest.ru'},
        )
        return True
    except Exception:
        return False


def handler(event: dict, context) -> dict:
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    req_headers = event.get('headers') or {}
    token = req_headers.get('X-Auth-Token') or req_headers.get('x-auth-token') or ''

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = body.get('action') or (event.get('queryStringParameters') or {}).get('action') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # --- Публичный VAPID-ключ (без авторизации) ---
            # Ключи создаются автоматически при первом запросе
            if action == 'vapid_public':
                pub, _ = _load_vapid_keys(cur)
                conn.commit()
                return _ok({'vapid_public_key': pub, 'auto_generated': True})

            # --- Всё остальное требует авторизации ---
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ADMIN_ROLES:
                return _err(403, 'Нет доступа')

            pub_key, priv_key = _load_vapid_keys(cur)
            conn.commit()

            # --- Подписка ---
            if action == 'subscribe':
                endpoint = body.get('endpoint', '')
                p256dh = body.get('p256dh', '')
                auth_key = body.get('auth', '')
                ua = _safe(req_headers.get('user-agent') or '', 300)

                if not endpoint or not p256dh or not auth_key:
                    return _err(400, 'Неверные данные подписки')

                ep = _safe(endpoint, 2000)
                p = _safe(p256dh, 500)
                a = _safe(auth_key, 100)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.push_subscriptions "
                    f"(user_id, endpoint, p256dh, auth, user_agent) "
                    f"VALUES ({user['id']}, '{ep}', '{p}', '{a}', '{ua}') "
                    f"ON CONFLICT (user_id, endpoint) DO UPDATE "
                    f"SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth"
                )
                conn.commit()
                return _ok({'ok': True, 'message': 'Подписка сохранена'})

            # --- Отписка ---
            if action == 'unsubscribe':
                endpoint = _safe(body.get('endpoint', ''), 2000)
                cur.execute(
                    f"UPDATE {SCHEMA}.push_subscriptions SET auth = 'removed' "
                    f"WHERE user_id = {user['id']} AND endpoint = '{endpoint}'"
                )
                conn.commit()
                return _ok({'ok': True})

            # --- Проверка статуса подписки ---
            if action == 'check':
                endpoint = _safe(body.get('endpoint', ''), 2000)
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.push_subscriptions "
                    f"WHERE user_id = {user['id']} AND endpoint = '{endpoint}' "
                    f"AND auth != 'removed'"
                )
                row = cur.fetchone()
                return _ok({'subscribed': row is not None})

            # --- Ручная отправка (только admin/manager) ---
            if action == 'send':
                if user['role'] not in ('admin', 'manager'):
                    return _err(403, 'Отправка — только для admin/manager')
                if not priv_key or not pub_key:
                    return _err(503, 'VAPID ключи не сгенерированы')

                payload = {
                    'title': body.get('title', 'BIZNEST'),
                    'body': body.get('body', ''),
                    'url': body.get('url', '/'),
                    'tag': body.get('tag', 'biznest'),
                    'requireInteraction': body.get('requireInteraction', False),
                }

                cur.execute(
                    f"SELECT endpoint, p256dh, auth FROM {SCHEMA}.push_subscriptions "
                    f"WHERE auth != 'removed'"
                )
                subs = cur.fetchall()
                sent = 0
                failed = 0
                for sub in subs:
                    ok = _send_push_notification(
                        sub['endpoint'], sub['p256dh'], sub['auth'],
                        payload, priv_key, pub_key
                    )
                    if ok:
                        sent += 1
                    else:
                        failed += 1

                return _ok({'ok': True, 'sent': sent, 'failed': failed, 'total': len(subs)})

            # --- Статус VAPID (для диагностики, только admin) ---
            if action == 'vapid_status':
                if user['role'] != 'admin':
                    return _err(403, 'Только для admin')
                has_keys = bool(pub_key and priv_key)
                cur.execute(
                    f"SELECT COUNT(*) as cnt FROM {SCHEMA}.push_subscriptions WHERE auth != 'removed'"
                )
                row = cur.fetchone()
                return _ok({
                    'keys_ready': has_keys,
                    'public_key_prefix': pub_key[:16] + '...' if pub_key else '',
                    'subscriptions_count': row['cnt'] if row else 0,
                    'auto_generated': True,
                })

            # --- Сброс и перегенерация ключей (только admin) ---
            if action == 'rotate_keys':
                if user['role'] != 'admin':
                    return _err(403, 'Только для admin')
                pub, priv = _generate_vapid_keys()
                pub_s = _safe(pub, 500)
                priv_s = _safe(priv, 500)
                cur.execute(
                    f"UPDATE {SCHEMA}.settings SET "
                    f"vapid_public_key = '{pub_s}', vapid_private_key = '{priv_s}', updated_at = NOW() "
                    f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
                )
                # Все старые подписки становятся невалидными — помечаем как removed
                cur.execute(
                    f"UPDATE {SCHEMA}.push_subscriptions SET auth = 'removed'"
                )
                conn.commit()
                return _ok({
                    'ok': True,
                    'message': 'Ключи перегенерированы. Все подписчики должны переподписаться.',
                    'public_key_prefix': pub[:16] + '...',
                })

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')