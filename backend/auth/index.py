"""
Business: Авторизация — логин, регистрация, получение текущего пользователя по токену сессии.
Args: event с httpMethod (POST/GET), queryStringParameters {action}, body {email, password, name, phone}; context
Returns: HTTP-ответ с user и token, или ошибку авторизации
"""

import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def _ok(body: dict, status: int = 200) -> dict:
    return {
        'statusCode': status,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
        },
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code: int, msg: str) -> dict:
    return _ok({'error': msg}, code)


def _safe(s: str, length: int = 255) -> str:
    return (s or '').replace("'", "''")[:length]


def handler(event: dict, context) -> dict:
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

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if action == 'login' and method == 'POST':
                body = json.loads(event.get('body') or '{}')
                email = _safe((body.get('email') or '').lower().strip(), 150)
                password = body.get('password') or ''
                if not email or not password:
                    return _err(400, 'Email и пароль обязательны')
                cur.execute(
                    f"SELECT id, email, name, role, phone, avatar, password_hash, is_active "
                    f"FROM {SCHEMA}.users WHERE email = '{email}'"
                )
                u = cur.fetchone()
                if not u or u['password_hash'] != _hash(password):
                    return _err(401, 'Неверный email или пароль')
                if not u['is_active']:
                    return _err(403, 'Аккаунт отключён')
                tok = secrets.token_urlsafe(32)
                exp = datetime.utcnow() + timedelta(days=30)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.sessions (token, user_id, expires_at) "
                    f"VALUES ('{tok}', {u['id']}, '{exp.isoformat()}')"
                )
                conn.commit()
                user = {k: u[k] for k in ('id', 'email', 'name', 'role', 'phone', 'avatar')}
                return _ok({'token': tok, 'user': user})

            if action == 'register' and method == 'POST':
                body = json.loads(event.get('body') or '{}')
                email = _safe((body.get('email') or '').lower().strip(), 150)
                password = body.get('password') or ''
                name = _safe(body.get('name') or '', 150)
                phone = _safe(body.get('phone') or '', 30)
                if not email or not password or not name:
                    return _err(400, 'Заполните email, пароль и имя')
                if len(password) < 6:
                    return _err(400, 'Пароль минимум 6 символов')
                cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE email = '{email}'")
                if cur.fetchone():
                    return _err(409, 'Email уже используется')
                pw_hash = _hash(password)
                phone_s = "NULL" if not phone else f"'{phone}'"
                cur.execute(
                    f"INSERT INTO {SCHEMA}.users (email, password_hash, name, phone, role) "
                    f"VALUES ('{email}', '{pw_hash}', '{name}', {phone_s}, 'client') RETURNING id"
                )
                uid = cur.fetchone()['id']
                tok = secrets.token_urlsafe(32)
                exp = datetime.utcnow() + timedelta(days=30)
                cur.execute(
                    f"INSERT INTO {SCHEMA}.sessions (token, user_id, expires_at) "
                    f"VALUES ('{tok}', {uid}, '{exp.isoformat()}')"
                )
                conn.commit()
                return _ok({
                    'token': tok,
                    'user': {'id': uid, 'email': email, 'name': name, 'role': 'client', 'phone': phone or None, 'avatar': None},
                })

            if action == 'logout' and method == 'POST':
                if token:
                    tok_safe = _safe(token, 100)
                    cur.execute(f"DELETE FROM {SCHEMA}.sessions WHERE token = '{tok_safe}'")
                    conn.commit()
                return _ok({'success': True})

            if action == 'me':
                if not token:
                    return _err(401, 'Нет токена')
                tok_safe = _safe(token, 100)
                cur.execute(
                    f"SELECT u.id, u.email, u.name, u.role, u.phone, u.avatar "
                    f"FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
                    f"WHERE s.token = '{tok_safe}' AND s.expires_at > NOW() AND u.is_active = TRUE"
                )
                u = cur.fetchone()
                if not u:
                    return _err(401, 'Сессия истекла')
                return _ok({'user': dict(u)})

            return _err(400, 'Неизвестное действие')
    finally:
        conn.close()