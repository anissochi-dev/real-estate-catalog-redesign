"""
Business: Сохранение токена сообщества VK, полученного администратором вручную через
Implicit Flow (oauth.vk.com/authorize с group_ids=..., response_type=token) — backend
vk-market-sync использует его ТОЛЬКО для загрузки фото в товары
(photos.getMarketUploadServer не работает ни с токеном сообщества из Управления
сообществом, ни с токенами нового VK ID — проверено, обе схемы возвращают ошибки
VK 27/28/1051 «method is unavailable»; токен сообщества, выданный именно через
Implicit Flow с group_ids, — единственный подтверждённый рабочий вариант).
Сами товары (add/edit/delete) управляются отдельным токеном сообщества
(VK_COMMUNITY_TOKEN), эта функция его не трогает.
VK возвращает токен под ключом access_token_{group_id} (не просто access_token) —
это обрабатывается при разборе присланной ссылки.
Args: event с httpMethod GET (action=start|status) или POST (сохранение токена из URL)
Returns: redirect (302) на VK для входа, JSON статус, либо результат сохранения токена
"""

import json
import os
import urllib.parse
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_OAUTH_AUTHORIZE = 'https://oauth.vk.com/authorize'
VK_API_VERSION = '5.199'
# Implicit Flow: VK кладёт токен в фрагмент (#access_token=...) адреса blank.html —
# фрагмент серверу не виден, поэтому администратор один раз копирует получившуюся
# ссылку целиком и вставляет её в админку, а уже фронтенд шлёт токен сюда POST'ом.
BLANK_REDIRECT = 'https://oauth.vk.com/blank.html'

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


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    app_id = os.environ.get('VK_APP_ID')
    group_id = os.environ.get('VK_GROUP_ID')
    dsn = os.environ['DATABASE_URL']

    if method == 'POST':
        # Администратор вставил в админке ссылку (или сам токен), полученную после
        # входа на blank.html#access_token=...&expires_in=...&user_id=...
        body = json.loads(event.get('body') or '{}')
        raw = (body.get('token_or_url') or '').strip()
        if not raw:
            return _err(400, 'Пустое значение — вставьте ссылку целиком или сам токен')

        access_token = None
        expires_in = None
        vk_user_id = None

        if raw.startswith('http'):
            frag = raw.split('#', 1)[1] if '#' in raw else ''
            qs = urllib.parse.parse_qs(frag)
            # При запросе с group_ids VK возвращает токен сообщества под ключом
            # access_token_{group_id} (а не просто access_token) — ищем оба варианта.
            access_token = (qs.get('access_token') or [None])[0]
            if not access_token and group_id:
                access_token = (qs.get(f'access_token_{group_id}') or [None])[0]
            if not access_token:
                # запасной вариант — берём любой ключ, начинающийся с access_token
                for k, v in qs.items():
                    if k.startswith('access_token') and v:
                        access_token = v[0]
                        break
            expires_in = (qs.get('expires_in') or [None])[0]
            vk_user_id = (qs.get('user_id') or [None])[0]
        else:
            access_token = raw

        if not access_token:
            return _err(400, 'Не удалось найти access_token в присланной ссылке — вставьте адрес целиком, начиная с https://oauth.vk.ru/blank.html#...')

        # expires_in=0 у токена сообщества означает «бессрочный» — не ошибка.
        expires_at = (datetime.utcnow() + timedelta(seconds=int(expires_in))) if expires_in and int(expires_in) > 0 else None

        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"INSERT INTO {SCHEMA}.vk_oauth_tokens (group_id, user_id, access_token, refresh_token, device_id, expires_at, scope, updated_at) "
                    f"VALUES (%s, %s, %s, %s, %s, %s, %s, NOW()) "
                    f"ON CONFLICT (group_id) DO UPDATE SET "
                    f"user_id = EXCLUDED.user_id, access_token = EXCLUDED.access_token, "
                    f"expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = NOW()",
                    (int(group_id) if group_id else 0, int(vk_user_id) if vk_user_id else None, access_token, None, None, expires_at, 'photos,market')
                )
                conn.commit()
        finally:
            conn.close()

        return _ok({'ok': True, 'message': 'Токен сохранён. Загрузка фото должна заработать.'})

    if params.get('action') == 'status':
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"SELECT user_id, expires_at, updated_at FROM {SCHEMA}.vk_oauth_tokens WHERE group_id = %s", (int(group_id) if group_id else 0,))
                row = cur.fetchone()
        finally:
            conn.close()
        return _ok({'connected': bool(row), 'info': dict(row) if row else None})

    # Действие по умолчанию: отправляем администратора на страницу VK, чтобы он вошёл
    # и подтвердил доступ к сообществу — Implicit Flow, VK вернёт токен СООБЩЕСТВА
    # прямо в адресной строке (после #), без участия нашего сервера.
    if not app_id:
        return _err(400, 'VK_APP_ID не настроен')
    if not group_id:
        return _err(400, 'VK_GROUP_ID не настроен')

    q = urllib.parse.urlencode({
        'client_id': app_id,
        'display': 'page',
        'redirect_uri': BLANK_REDIRECT,
        'scope': 'photos,market',
        'response_type': 'token',
        'group_ids': group_id,
        'v': VK_API_VERSION,
    })
    return _redirect(f'{VK_OAUTH_AUTHORIZE}?{q}')