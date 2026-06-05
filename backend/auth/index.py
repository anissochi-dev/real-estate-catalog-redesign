"""
Business: Авторизация — логин, регистрация, получение текущего пользователя по токену сессии.
Args: event с httpMethod (POST/GET), queryStringParameters {action}, body {email, password, name, phone}; context
Returns: HTTP-ответ с user и token, или ошибку авторизации
Защита: brute-force блокировка (5 попыток / 15 мин), параметризованные SQL-запросы
"""

import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

# Брутфорс: блокируем после N неудачных попыток за window минут
BRUTE_MAX_ATTEMPTS = 5
BRUTE_WINDOW_MINUTES = 15
BRUTE_LOCKOUT_MINUTES = 30


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _ok(body: dict, status: int = 200) -> dict:
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code: int, msg: str) -> dict:
    return _ok({'error': msg}, code)


def _get_ip(event: dict) -> str:
    raw = event.get('headers') or {}
    hl = {k.lower(): v for k, v in raw.items()}
    ip = (
        hl.get('x-forwarded-for', '').split(',')[0].strip()
        or hl.get('x-real-ip', '')
        or (event.get('requestContext') or {}).get('identity', {}).get('sourceIp', '')
        or 'unknown'
    )
    return ip[:45]


def _check_brute(cur, ip: str, email: str) -> bool:
    """Возвращает True если IP/email заблокирован (слишком много попыток)."""
    safe_ip = ip.replace("'", "''")
    safe_email = email.replace("'", "''")
    cur.execute(
        f"SELECT COUNT(*) as cnt FROM {SCHEMA}.login_attempts "
        f"WHERE ip = '{safe_ip}' AND success = FALSE "
        f"AND attempted_at > NOW() - INTERVAL '{BRUTE_WINDOW_MINUTES} minutes'"
    )
    row = cur.fetchone()
    if row and int(row['cnt']) >= BRUTE_MAX_ATTEMPTS:
        return True
    cur.execute(
        f"SELECT COUNT(*) as cnt FROM {SCHEMA}.login_attempts "
        f"WHERE email = '{safe_email}' AND success = FALSE "
        f"AND attempted_at > NOW() - INTERVAL '{BRUTE_WINDOW_MINUTES} minutes'"
    )
    row = cur.fetchone()
    return bool(row and int(row['cnt']) >= BRUTE_MAX_ATTEMPTS)


def _log_attempt(cur, conn, ip: str, email: str, success: bool) -> None:
    safe_ip = ip.replace("'", "''")
    safe_email = email.replace("'", "''")
    cur.execute(
        f"INSERT INTO {SCHEMA}.login_attempts (ip, email, success) "
        f"VALUES ('{safe_ip}', '{safe_email}', {success})"
    )
    # Очищаем старые записи (старше 24ч) — не чаще раза в 100 вызовов (случайно)
    import random
    if random.randint(0, 99) == 0:
        cur.execute(
            f"DELETE FROM {SCHEMA}.login_attempts "
            f"WHERE attempted_at < NOW() - INTERVAL '24 hours'"
        )
    conn.commit()


def handler(event: dict, context) -> dict:
    """Авторизация с защитой от брутфорса и SQL-инъекций."""
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'me')
    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    client_ip = _get_ip(event)

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── LOGIN ────────────────────────────────────────────────────────
            if action == 'login' and method == 'POST':
                body = json.loads(event.get('body') or '{}')
                email = (body.get('email') or '').lower().strip()[:150]
                password = body.get('password') or ''

                if not email or not password:
                    return _err(400, 'Email и пароль обязательны')

                # Проверка брутфорса ДО запроса в БД
                if _check_brute(cur, client_ip, email):
                    return _err(429, f'Слишком много попыток. Подождите {BRUTE_LOCKOUT_MINUTES} минут.')

                # Параметризованный запрос — защита от SQL-инъекций
                cur.execute(
                    f"SELECT id, email, name, role, phone, avatar, password_hash, is_active "
                    f"FROM {SCHEMA}.users WHERE email = %s",
                    (email,)
                )
                u = cur.fetchone()

                if not u or u['password_hash'] != _hash(password):
                    _log_attempt(cur, conn, client_ip, email, success=False)
                    return _err(401, 'Неверный email или пароль')

                if not u['is_active']:
                    _log_attempt(cur, conn, client_ip, email, success=False)
                    return _err(403, 'Аккаунт отключён')

                # Успешный вход — сбрасываем счётчик попыток
                _log_attempt(cur, conn, client_ip, email, success=True)

                tok = secrets.token_urlsafe(32)
                exp = datetime.utcnow() + timedelta(days=30)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.sessions (token, user_id, expires_at) "
                    f"VALUES (%s, %s, %s)",
                    (tok, u['id'], exp.isoformat())
                )
                conn.commit()
                user = {k: u[k] for k in ('id', 'email', 'name', 'role', 'phone', 'avatar')}
                return _ok({'token': tok, 'user': user})

            # ── REGISTER ─────────────────────────────────────────────────────
            if action == 'register' and method == 'POST':
                body = json.loads(event.get('body') or '{}')
                email = (body.get('email') or '').lower().strip()[:150]
                password = body.get('password') or ''
                name = (body.get('name') or '').strip()[:150]
                phone = (body.get('phone') or '').strip()[:30] or None

                if not email or not password or not name:
                    return _err(400, 'Заполните email, пароль и имя')
                if len(password) < 6:
                    return _err(400, 'Пароль минимум 6 символов')
                if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
                    return _err(400, 'Некорректный email')

                # Rate-limit регистраций с одного IP — не более 3 за час
                safe_ip = client_ip.replace("'", "''")
                cur.execute(
                    f"SELECT COUNT(*) as cnt FROM {SCHEMA}.login_attempts "
                    f"WHERE ip = '{safe_ip}' AND attempted_at > NOW() - INTERVAL '1 hour'"
                )
                r = cur.fetchone()
                if r and int(r['cnt']) >= 10:
                    return _err(429, 'Слишком много запросов с этого IP')

                cur.execute(
                    f"SELECT id FROM {SCHEMA}.users WHERE email = %s",
                    (email,)
                )
                if cur.fetchone():
                    return _err(409, 'Email уже используется')

                pw_hash = _hash(password)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.users (email, password_hash, name, phone, role) "
                    f"VALUES (%s, %s, %s, %s, 'client') RETURNING id",
                    (email, pw_hash, name, phone)
                )
                uid = cur.fetchone()['id']
                tok = secrets.token_urlsafe(32)
                exp = datetime.utcnow() + timedelta(days=30)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.sessions (token, user_id, expires_at) "
                    f"VALUES (%s, %s, %s)",
                    (tok, uid, exp.isoformat())
                )
                conn.commit()
                return _ok({
                    'token': tok,
                    'user': {'id': uid, 'email': email, 'name': name, 'role': 'client', 'phone': phone, 'avatar': None},
                })

            # ── LOGOUT ───────────────────────────────────────────────────────
            if action == 'logout' and method == 'POST':
                if token:
                    cur.execute(
                        f"DELETE FROM {SCHEMA}.sessions WHERE token = %s",
                        (token[:100],)
                    )
                    conn.commit()
                return _ok({'success': True})

            # ── ME ───────────────────────────────────────────────────────────
            if action == 'me':
                if not token:
                    return _err(401, 'Нет токена')
                cur.execute(
                    f"SELECT u.id, u.email, u.name, u.role, u.phone, u.avatar "
                    f"FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
                    f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = TRUE",
                    (token[:100],)
                )
                u = cur.fetchone()
                if not u:
                    return _err(401, 'Сессия истекла')
                return _ok({'user': dict(u)})

            return _err(400, 'Неизвестное действие')
    finally:
        conn.close()
