"""
Push-уведомления для администраторов: подписка, отписка, отправка.
Используется для оповещения о новых лидах на модерации.
Args: POST {action: subscribe|unsubscribe|send|vapid_public|check}, headers X-Auth-Token
Returns: {ok} или {vapid_public_key}
"""
import json
import os
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


def _send_push(subscription_info: dict, payload: dict, vapid_private: str, vapid_public: str) -> bool:
    """Отправляет web push через pywebpush. Возвращает True если успешно."""
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=vapid_private,
            vapid_claims={'sub': 'mailto:admin@biznest.ru'},
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
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = body.get('action') or (event.get('queryStringParameters') or {}).get('action') or ''
    vapid_public = os.environ.get('VAPID_PUBLIC_KEY', '')
    vapid_private = os.environ.get('VAPID_PRIVATE_KEY', '')

    # Публичный ключ можно получить без авторизации
    if action == 'vapid_public':
        return _ok({'vapid_public_key': vapid_public})

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ADMIN_ROLES:
                return _err(403, 'Нет доступа')

            if action == 'subscribe':
                endpoint = body.get('endpoint', '')
                p256dh = body.get('p256dh', '')
                auth_key = body.get('auth', '')
                ua = _safe(headers.get('user-agent') or '', 300)
                if not endpoint or not p256dh or not auth_key:
                    return _err(400, 'Неверные данные подписки')

                ep = _safe(endpoint, 2000)
                p = _safe(p256dh, 500)
                a = _safe(auth_key, 100)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) "
                    f"VALUES ({user['id']}, '{ep}', '{p}', '{a}', '{ua}') "
                    f"ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth"
                )
                conn.commit()
                return _ok({'ok': True, 'message': 'Подписка сохранена'})

            if action == 'unsubscribe':
                endpoint = _safe(body.get('endpoint', ''), 2000)
                cur.execute(
                    f"UPDATE {SCHEMA}.push_subscriptions SET endpoint = endpoint "
                    f"WHERE user_id = {user['id']} AND endpoint = '{endpoint}'"
                )
                # Помечаем как неактивную (не удаляем из-за ограничений)
                cur.execute(
                    f"UPDATE {SCHEMA}.push_subscriptions SET auth = 'removed' "
                    f"WHERE user_id = {user['id']} AND endpoint = '{endpoint}'"
                )
                conn.commit()
                return _ok({'ok': True})

            if action == 'check':
                endpoint = _safe(body.get('endpoint', ''), 2000)
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.push_subscriptions "
                    f"WHERE user_id = {user['id']} AND endpoint = '{endpoint}' AND auth != 'removed'"
                )
                row = cur.fetchone()
                return _ok({'subscribed': row is not None})

            # Отправка уведомления всем подписанным админам (только для admin/manager)
            if action == 'send':
                if user['role'] not in ('admin', 'manager'):
                    return _err(403, 'Отправка — только для admin/manager')
                if not vapid_private or not vapid_public:
                    return _err(503, 'VAPID ключи не настроены')

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
                for sub in subs:
                    sub_info = {
                        'endpoint': sub['endpoint'],
                        'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']},
                    }
                    ok = _send_push(sub_info, payload, vapid_private, vapid_public)
                    if ok:
                        sent += 1

                return _ok({'ok': True, 'sent': sent, 'total': len(subs)})

    finally:
        conn.close()

    return _err(400, 'Неизвестное действие')
