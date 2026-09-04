"""
Business: Вход администратора сообщества VK через актуальный протокол VK ID —
Authorization Code + PKCE (id.vk.ru). Заменяет устаревший Implicit Flow
(oauth.vk.com), который выдавал токен СООБЩЕСТВА, непригодный для
photos.getMarketUploadServer (см. историю ошибок VK 27/3). Новый флоу выдаёт
личный токен ПОЛЬЗОВАТЕЛЯ-администратора со scope market,photos,groups,offline —
этим токеном backend vk-market-sync теперь вызывает и market.add/edit/delete,
и photos.getMarketUploadServer/saveMarketPhoto (VK_COMMUNITY_TOKEN больше не
используется). Scope offline обязателен: без него VK привязывает токен к
IP-адресу браузера, в котором проходил вход, и вызовы с backend (меняющийся
исходящий IP облачных функций) отклоняются ошибкой VK 5 "access_token was
given to another ip address". Для обмена code на токен конфиденциальному
приложению обязателен параметр service_token (Сервисный ключ доступа из
настроек приложения VK ID) — это НЕ то же самое, что client_secret
(Защищённый ключ); передача client_secret вместо service_token приводит
к ошибке invalid_grant "service_token is missing or invalid". code_verifier
на время редиректа хранится в vk_oauth_pending по ключу state (PKCE
требует, чтобы он совпал при обмене кода на токен).
Args: event с httpMethod GET (action=start — редирект на VK; action=callback —
      обмен code на токен; action=status — статус подключения)
Returns: redirect (302) на VK для входа, редирект обратно в админку после
      обмена токена, либо JSON статус подключения
"""

import json
import os
import re
import secrets
import hashlib
import base64
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_ID_AUTHORIZE = 'https://id.vk.ru/authorize'
VK_ID_TOKEN = 'https://id.vk.ru/oauth2/auth'
VK_API_VERSION = '5.199'
# offline обязателен: без него VK привязывает токен к IP-адресу браузера, в
# котором проходил вход, и любой запрос с другого IP (а наш backend обращается
# к VK API с меняющегося IP облачных функций) отклоняется ошибкой
# "User authorization failed: access_token was given to another ip address".
SCOPE = 'market photos groups offline'
# После обмена code -> token редиректим админа обратно в админку. Разрешаем
# только адреса на poehali.dev/поддомены, чтобы не превращать эндпоинт
# в открытый редиректор.
DEFAULT_RETURN_URL = 'https://poehali.dev'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
}


def _ok(data):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _err(status, msg):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _redirect(url):
    return {'statusCode': 302, 'headers': {**CORS, 'Location': url}, 'body': ''}


def _self_url():
    return os.environ.get('VK_OAUTH_SELF_URL') or 'https://functions.poehali.dev/00319010-cbca-43bf-ae81-3431d4d8de20'


def _gen_pkce():
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip('=')
    return code_verifier, code_challenge


def _html_error(msg):
    safe = msg.replace('<', '&lt;').replace('>', '&gt;')
    body = f'<html><body style="font-family:sans-serif;padding:24px"><h3>Не удалось подключить VK</h3><p>{safe}</p><p>Закройте эту вкладку и попробуйте ещё раз.</p></body></html>'
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'text/html; charset=utf-8'}, 'body': body}


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    app_id = os.environ.get('VK_APP_ID')
    group_id = os.environ.get('VK_GROUP_ID')
    service_token = os.environ.get('VK_SERVICE_TOKEN')
    dsn = os.environ['DATABASE_URL']
    action = params.get('action')

    # ── Callback от VK: пришёл code, обмениваем на токен ──
    if action == 'callback' or (method == 'GET' and params.get('code')):
        code = params.get('code')
        state = params.get('state')
        device_id = params.get('device_id') or ''
        if not code or not state:
            return _html_error('VK не вернул code/state — попробуйте войти ещё раз.')

        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT code_verifier, return_url FROM {SCHEMA}.vk_oauth_pending WHERE state = %s", (state,))
                row = cur.fetchone()
                if not row:
                    return _html_error('Сессия входа истекла или уже использована — начните вход заново.')
                code_verifier = row['code_verifier']
                return_url = row.get('return_url')
                cur.execute(f"DELETE FROM {SCHEMA}.vk_oauth_pending WHERE state = %s", (state,))
                conn.commit()

                payload = {
                    'grant_type': 'authorization_code',
                    'code': code,
                    'code_verifier': code_verifier,
                    'redirect_uri': _self_url(),
                    'client_id': app_id,
                    'device_id': device_id,
                    'state': state,
                }
                if service_token:
                    payload['service_token'] = service_token
                data = urllib.parse.urlencode(payload).encode()
                req = urllib.request.Request(VK_ID_TOKEN, data=data, method='POST')
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                try:
                    with urllib.request.urlopen(req, timeout=15) as r:
                        resp = json.loads(r.read().decode())
                except urllib.error.HTTPError as e:
                    return _html_error(f'VK отклонил обмен кода на токен: HTTP {e.code} {e.read().decode(errors="ignore")}')
                except Exception as e:
                    return _html_error(f'Ошибка обмена кода на токен: {e}')

                access_token = resp.get('access_token')
                if not access_token:
                    return _html_error(f'VK не вернул access_token: {resp}')
                refresh_token = resp.get('refresh_token')
                expires_in = resp.get('expires_in')
                vk_user_id = resp.get('user_id')
                expires_at = (datetime.utcnow() + timedelta(seconds=int(expires_in))) if expires_in else None

                cur.execute(
                    f"INSERT INTO {SCHEMA}.vk_oauth_tokens (group_id, user_id, access_token, refresh_token, device_id, expires_at, scope, updated_at) "
                    f"VALUES (%s, %s, %s, %s, %s, %s, %s, NOW()) "
                    f"ON CONFLICT (group_id) DO UPDATE SET "
                    f"user_id = EXCLUDED.user_id, access_token = EXCLUDED.access_token, "
                    f"refresh_token = EXCLUDED.refresh_token, device_id = EXCLUDED.device_id, "
                    f"expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = NOW()",
                    (int(group_id) if group_id else 0, int(vk_user_id) if vk_user_id else None,
                     access_token, refresh_token, device_id, expires_at, SCOPE)
                )
                conn.commit()
        finally:
            conn.close()

        target = return_url or DEFAULT_RETURN_URL
        sep = '&' if '?' in target else '?'
        return _redirect(f'{target}{sep}vk_connected=1')

    if action == 'my_ip':
        # ДИАГНОСТИКА: исходящий IP именно этой функции (vk-oauth) — он может
        # отличаться от IP функции vk-market-sync, т.к. это разные контейнеры.
        try:
            with urllib.request.urlopen('https://api.ipify.org?format=json', timeout=10) as r:
                ip_info = json.loads(r.read().decode())
        except Exception as e:
            ip_info = {'error': str(e)}
        return _ok({'outbound_ip': ip_info.get('ip'), 'raw': ip_info})

    if action == 'status':
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT user_id, expires_at, updated_at FROM {SCHEMA}.vk_oauth_tokens WHERE group_id = %s", (int(group_id) if group_id else 0,))
                row = cur.fetchone()
        finally:
            conn.close()
        return _ok({'connected': bool(row), 'info': dict(row) if row else None})

    # ── Действие по умолчанию: старт входа — редирект на id.vk.ru с PKCE ──
    if not app_id:
        return _err(400, 'VK_APP_ID не настроен')
    if not group_id:
        return _err(400, 'VK_GROUP_ID не настроен')

    code_verifier, code_challenge = _gen_pkce()
    state = secrets.token_urlsafe(24)
    return_url = params.get('return_url') or ''

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"DELETE FROM {SCHEMA}.vk_oauth_pending WHERE created_at < NOW() - INTERVAL '1 hour'")
            cur.execute(f"INSERT INTO {SCHEMA}.vk_oauth_pending (state, code_verifier, return_url, created_at) VALUES (%s, %s, %s, NOW())", (state, code_verifier, return_url or None))
            conn.commit()
    finally:
        conn.close()

    q = urllib.parse.urlencode({
        'response_type': 'code',
        'client_id': app_id,
        'redirect_uri': _self_url(),
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'scope': SCOPE,
        'prompt': 'consent',
    })
    return _redirect(f'{VK_ID_AUTHORIZE}?{q}')