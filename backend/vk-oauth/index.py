"""
Business: OAuth-вход администратора сообщества VK (Authorization Code Flow) —
получает токен ПОЛЬЗОВАТЕЛЯ с правами groups+photos, который backend vk-market-sync
использует ТОЛЬКО для загрузки фото в товары (photos.getMarketUploadServer не
работает с токеном сообщества — ограничение VK API). Сами товары (add/edit/delete)
управляются отдельным токеном сообщества (VK_COMMUNITY_TOKEN), эта функция его не трогает.
Args: event с httpMethod GET, queryStringParameters {action: start|callback, code, state}
Returns: redirect (302) на VK для входа, либо на админку с результатом после обмена кода
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_OAUTH_AUTHORIZE = 'https://oauth.vk.com/authorize'
VK_OAUTH_TOKEN = 'https://oauth.vk.com/access_token'
VK_API_BASE = 'https://api.vk.com/method'
VK_API_VERSION = '5.199'
# Redirect URI — собственный URL этой функции (заполняется после первого деплоя,
# см. func2url.json). VK строго сверяет redirect_uri при обмене кода на токен.
SELF_URL = 'https://functions.poehali.dev/00319010-cbca-43bf-ae81-3431d4d8de20'

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
    app_secret = os.environ.get('VK_APP_SECRET')
    group_id = os.environ.get('VK_GROUP_ID')

    action = params.get('action', 'start')

    if action == 'start':
        # Шаг 1: отправляем администратора на страницу авторизации VK.
        # scope: groups (проверка админских прав) + photos (загрузка фото в товары).
        if not app_id:
            return _err(400, 'VK_APP_ID не настроен')
        q = urllib.parse.urlencode({
            'client_id': app_id,
            'display': 'page',
            'redirect_uri': SELF_URL + '?action=callback',
            'scope': 'groups,photos',
            'response_type': 'code',
            'v': VK_API_VERSION,
        })
        return _redirect(f'{VK_OAUTH_AUTHORIZE}?{q}')

    if action == 'callback':
        # Шаг 2: VK вернул код — меняем на токен пользователя и сохраняем в БД.
        code = params.get('code')
        vk_error = params.get('error_description') or params.get('error')
        if vk_error:
            return _ok({'ok': False, 'error': f'VK отклонил вход: {vk_error}'})
        if not code:
            return _err(400, 'Нет кода авторизации')
        if not app_id or not app_secret:
            return _err(400, 'VK_APP_ID / VK_APP_SECRET не настроены')

        q = urllib.parse.urlencode({
            'client_id': app_id,
            'client_secret': app_secret,
            'redirect_uri': SELF_URL + '?action=callback',
            'code': code,
        })
        try:
            with urllib.request.urlopen(f'{VK_OAUTH_TOKEN}?{q}', timeout=15) as r:
                resp = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            return _ok({'ok': False, 'error': f'Ошибка обмена кода: {body[:300]}'})
        except Exception as e:
            return _ok({'ok': False, 'error': str(e)})

        access_token = resp.get('access_token')
        vk_user_id = resp.get('user_id')
        if not access_token:
            return _ok({'ok': False, 'error': f'VK не вернул токен: {resp}'})

        # Проверяем, что пользователь действительно админ нужной группы.
        if group_id:
            groups_data, err = _vk_call('groups.get', {
                'access_token': access_token, 'filter': 'admin', 'extended': 1,
            })
            group_ids = [str(g.get('id')) for g in ((groups_data or {}).get('items') or [])]
            if err or str(group_id) not in group_ids:
                return _ok({'ok': False, 'error': 'Вы не администратор указанной группы (VK_GROUP_ID), либо не хватает прав'})

        expires_in = resp.get('expires_in')
        expires_at = (datetime.utcnow() + timedelta(seconds=int(expires_in))) if expires_in else None

        dsn = os.environ['DATABASE_URL']
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.vk_oauth_tokens (group_id, user_id, access_token, expires_at, scope, updated_at) "
                    f"VALUES (%s, %s, %s, %s, %s, NOW()) "
                    f"ON CONFLICT (group_id) DO UPDATE SET "
                    f"user_id = EXCLUDED.user_id, access_token = EXCLUDED.access_token, "
                    f"expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = NOW()",
                    (int(group_id) if group_id else 0, vk_user_id, access_token, expires_at, 'groups,photos')
                )
                conn.commit()
        finally:
            conn.close()

        return _ok({'ok': True, 'message': 'Вход выполнен, токен сохранён. Можно закрыть эту вкладку и вернуться в админку.'})

    if action == 'status':
        dsn = os.environ['DATABASE_URL']
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT user_id, expires_at, updated_at FROM {SCHEMA}.vk_oauth_tokens WHERE group_id = %s", (int(group_id) if group_id else 0,))
                row = cur.fetchone()
        finally:
            conn.close()
        return _ok({'connected': bool(row), 'info': dict(row) if row else None})

    return _err(400, 'Неизвестное действие')