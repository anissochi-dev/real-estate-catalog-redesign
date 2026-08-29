"""
Business: OAuth-вход администратора сообщества VK через протокол VK ID (Authorization
Code Flow + PKCE, id.vk.ru) — получает токен ПОЛЬЗОВАТЕЛЯ с правами groups+photos,
который backend vk-market-sync использует ТОЛЬКО для загрузки фото в товары
(photos.getMarketUploadServer не работает с токеном сообщества — ограничение VK API).
Сами товары (add/edit/delete) управляются отдельным токеном сообщества
(VK_COMMUNITY_TOKEN), эта функция его не трогает.
Args: event с httpMethod GET, queryStringParameters {action: start|status, code, state, device_id, error}
Returns: redirect (302) на VK для входа, либо JSON с результатом после обмена кода
"""

import json
import os
import re
import secrets
import hashlib
import base64
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_ID_AUTHORIZE = 'https://id.vk.ru/authorize'
VK_ID_TOKEN = 'https://id.vk.ru/oauth2/auth'
VK_API_BASE = 'https://api.vk.ru/method'
VK_API_VERSION = '5.199'
# Redirect URI — собственный «голый» URL этой функции без query-параметров
# (VK ID не разрешает query-параметры в Redirect URI настроек приложения).
SELF_URL = 'https://functions.poehali.dev/00319010-cbca-43bf-ae81-3431d4d8de20'
PENDING_TTL_MINUTES = 15

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
}


def _ok(data):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _err(status, msg):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _redirect(url):
    return {'statusCode': 302, 'headers': {**CORS, 'Location': url}, 'body': ''}


def _random_string(length):
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _code_challenge(verifier):
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')


def _vk_call(method, params):
    payload = {**params, 'v': VK_API_VERSION}
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(f'{VK_API_BASE}/{method}', data=data, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read().decode())
    except Exception as e:
        return None, str(e)
    if 'error' in resp:
        err = resp['error']
        return None, f"VK {err.get('error_code')}: {err.get('error_msg')}"
    return resp.get('response'), None


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    app_id = os.environ.get('VK_APP_ID')
    service_token = os.environ.get('VK_SERVICE_TOKEN')
    group_id = os.environ.get('VK_GROUP_ID')

    # VK ID не разрешает query-параметры в Redirect URI, поэтому наш собственный
    # ?action=... тоже не долетает обратно от VK — различаем шаги по факту:
    # редирект от VK всегда содержит code (или error), а обычный переход по
    # ссылке «Войти через VK» из админки — нет.
    is_vk_callback = bool(params.get('code') or params.get('error') or params.get('error_description'))

    dsn = os.environ['DATABASE_URL']

    if is_vk_callback:
        code = params.get('code')
        vk_state = params.get('state')
        device_id = params.get('device_id')
        vk_error = params.get('error_description') or params.get('error')
        if vk_error:
            return _ok({'ok': False, 'error': f'VK отклонил вход: {vk_error}'})
        if not code or not vk_state:
            return _err(400, 'Нет code или state в ответе VK')
        if not app_id or not service_token:
            return _err(400, 'VK_APP_ID / VK_SERVICE_TOKEN не настроены')

        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT code_verifier FROM {SCHEMA}.vk_oauth_pending WHERE state = %s AND created_at > NOW() - INTERVAL '{PENDING_TTL_MINUTES} minutes'",
                    (vk_state,)
                )
                row = cur.fetchone()
                if not row:
                    return _ok({'ok': False, 'error': 'Сессия входа устарела или state не совпадает — начните вход заново'})
                code_verifier = row['code_verifier']
                cur.execute(f"DELETE FROM {SCHEMA}.vk_oauth_pending WHERE state = %s", (vk_state,))
                conn.commit()

                # Шаг 2: обмен authorization_code на токены. Для конфиденциальных
                # приложений обязателен service_token (НЕ client_secret).
                token_params = {
                    'grant_type': 'authorization_code',
                    'code_verifier': code_verifier,
                    'redirect_uri': SELF_URL,
                    'code': code,
                    'client_id': app_id,
                    'device_id': device_id or '',
                    'state': vk_state,
                    'service_token': service_token,
                }
                data = urllib.parse.urlencode(token_params).encode()
                req = urllib.request.Request(VK_ID_TOKEN, data=data, method='POST')
                req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                try:
                    with urllib.request.urlopen(req, timeout=15) as r:
                        resp = json.loads(r.read().decode())
                except urllib.error.HTTPError as e:
                    body = e.read().decode()
                    return _ok({'ok': False, 'error': f'Ошибка обмена кода: {body[:500]}'})
                except Exception as e:
                    return _ok({'ok': False, 'error': str(e)})

                access_token = resp.get('access_token')
                refresh_token = resp.get('refresh_token')
                vk_user_id = resp.get('user_id')
                if not access_token:
                    return _ok({'ok': False, 'error': f'VK не вернул токен: {resp}'})

                # ВРЕМЕННАЯ ДИАГНОСТИКА: проверяем, работает ли вообще токен VK ID
                # с методом загрузки фото для товаров — независимо от проверки прав.
                photo_test, photo_test_err = _vk_call('photos.getMarketUploadServer', {
                    'access_token': access_token, 'group_id': group_id, 'main_photo': 1,
                })

                # Проверяем, что пользователь действительно админ нужной группы.
                if group_id:
                    groups_data, gerr = _vk_call('groups.get', {
                        'access_token': access_token, 'filter': 'admin', 'extended': 1,
                    })
                    group_ids = [str(g.get('id')) for g in ((groups_data or {}).get('items') or [])]
                    if gerr or str(group_id) not in group_ids:
                        return _ok({
                            'ok': False,
                            'error': 'Вы не администратор указанной группы (VK_GROUP_ID), либо не хватает прав',
                            'debug_vk_error': gerr,
                            'debug_group_id_expected': str(group_id),
                            'debug_group_ids_received': group_ids,
                            'debug_groups_raw': groups_data,
                            'debug_photo_upload_test': photo_test,
                            'debug_photo_upload_test_err': photo_test_err,
                        })

                expires_in = resp.get('expires_in')
                expires_at = (datetime.utcnow() + timedelta(seconds=int(expires_in))) if expires_in else None

                cur.execute(
                    f"INSERT INTO {SCHEMA}.vk_oauth_tokens (group_id, user_id, access_token, refresh_token, device_id, expires_at, scope, updated_at) "
                    f"VALUES (%s, %s, %s, %s, %s, %s, %s, NOW()) "
                    f"ON CONFLICT (group_id) DO UPDATE SET "
                    f"user_id = EXCLUDED.user_id, access_token = EXCLUDED.access_token, "
                    f"refresh_token = EXCLUDED.refresh_token, device_id = EXCLUDED.device_id, "
                    f"expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = NOW()",
                    (int(group_id) if group_id else 0, vk_user_id, access_token, refresh_token, device_id, expires_at, resp.get('scope') or 'groups,photos')
                )
                conn.commit()
        finally:
            conn.close()

        return _ok({'ok': True, 'message': 'Вход выполнен, токен сохранён. Можно закрыть эту вкладку и вернуться в админку.'})

    if params.get('action') == 'status':
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT user_id, expires_at, updated_at FROM {SCHEMA}.vk_oauth_tokens WHERE group_id = %s", (int(group_id) if group_id else 0,))
                row = cur.fetchone()
        finally:
            conn.close()
        return _ok({'connected': bool(row), 'info': dict(row) if row else None})

    # Шаг 1 (действие по умолчанию): генерируем PKCE-пару (code_verifier/code_challenge)
    # и state, сохраняем code_verifier во временную таблицу (нужен на шаге 2, когда
    # VK вернёт нас на этот же адрес), отправляем администратора на страницу VK ID.
    if not app_id:
        return _err(400, 'VK_APP_ID не настроен')

    code_verifier = _random_string(64)
    code_challenge = _code_challenge(code_verifier)
    state = _random_string(40)

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"DELETE FROM {SCHEMA}.vk_oauth_pending WHERE created_at < NOW() - INTERVAL '{PENDING_TTL_MINUTES} minutes'")
            cur.execute(
                f"INSERT INTO {SCHEMA}.vk_oauth_pending (state, code_verifier, created_at) VALUES (%s, %s, NOW())",
                (state, code_verifier)
            )
            conn.commit()
    finally:
        conn.close()

    q = urllib.parse.urlencode({
        'response_type': 'code',
        'client_id': app_id,
        'redirect_uri': SELF_URL,
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'scope': 'groups photos',
    })
    return _redirect(f'{VK_ID_AUTHORIZE}?{q}')