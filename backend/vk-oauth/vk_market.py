"""
Business: Точечная синхронизация товаров сообщества ВКонтакте через Market API
(market.add/edit/delete, photos.getMarketUploadServer/saveMarketPhoto) —
независимо от YML-фида «VK Товары» (который остаётся файлом для ручного
импорта). Работает по личному токену администратора группы, полученному через
VK ID Authorization Code + PKCE (см. backend/vk-oauth) — VK Market API требует
именно пользовательский токен, токен сообщества для market.* не подходит
(error 27 Group auth). Обновляет/добавляет/удаляет только изменившиеся объекты
(сравнение по хэшу), поэтому повторные запуски быстрые и не создают лишних
правок в VK.
Args: event с httpMethod GET/POST, queryStringParameters {action, feed_id}, body {feed_id}
Returns: JSON со статистикой синхронизации или статусом фида
"""

import json
import os
import re
import hashlib
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_API_BASE = 'https://api.vk.ru/method'
VK_ID_TOKEN = 'https://id.vk.ru/oauth2/auth'
VK_API_VERSION = '5.199'

# Бюджеты на один запуск — чтобы уложиться в таймаут функции. Удаление дешёвое
# (один вызов API), добавление/редактирование дорогое (скачивание + загрузка фото,
# до 5 штук на объект) — поэтому у них разные лимиты. Крон (раз в 15 минут)
# постепенно дорабатывает всё, что не поместилось в бюджет за один прогон.
ADD_EDIT_BUDGET = 8
DELETE_BUDGET = 30

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


def _get_user(cur, token):
    if not token:
        return None
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = %s AND s.expires_at > NOW() AND u.is_active = TRUE",
        (token,)
    )
    return cur.fetchone()


def _strip_html(text):
    return re.sub(r'<[^>]+>', ' ', text or '').replace('\xa0', ' ').strip()


def _split_images(row):
    if row.get('images'):
        return [u.strip() for u in str(row['images']).split('|') if u.strip()]
    if row.get('image'):
        return [row['image']]
    return []


def _total_price(l):
    """Та же логика расчёта итоговой цены, что и в backend/xml-feeds (продублирована,
    т.к. это отдельная развёрнутая функция без общего импорта между функциями)."""
    raw = l.get('price') or 0
    try:
        price = float(raw)
    except (TypeError, ValueError):
        return 0
    if l.get('price_unit') == 'm2' and l.get('area'):
        try:
            area = float(l['area'])
        except (TypeError, ValueError):
            area = 0
        if 0 < price <= 200_000 and area > 0:
            return int(price * area)
    if l.get('price_unit') == 'sotka' and l.get('land_area'):
        try:
            sotki = float(l['land_area'])
        except (TypeError, ValueError):
            sotki = 0
        if 0 < price <= 50_000_000 and sotki > 0:
            return int(price * sotki)
    return int(price)


def _content_hash(name, description, price, category_id, image_urls):
    raw = '|'.join([name or '', (description or '')[:500], str(price), str(category_id), '|'.join(image_urls)])
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def _vk_call(method, params, token):
    payload = {**params, 'access_token': token, 'v': VK_API_VERSION}
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(f'{VK_API_BASE}/{method}', data=data, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            resp = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)
    if 'error' in resp:
        err = resp['error']
        return None, f"VK {err.get('error_code')}: {err.get('error_msg')}"
    return resp.get('response'), None


def _download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


def _multipart_post(url, field_name, filename, content, content_type):
    boundary = 'PoehaliVKBoundary7f3a9c'
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f'Content-Type: {content_type}\r\n\r\n'
    ).encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def _refresh_admin_token(cur, conn, group_id, refresh_token, device_id):
    """VK ID Access token живёт недолго — обновляем через refresh_token
    (id.vk.ru/oauth2/auth, grant_type=refresh_token), не заставляя админа
    входить заново при каждом запуске синхронизации. device_id обязателен и
    должен быть тем же, что был выдан при исходном входе (сохранён в БД)."""
    app_id = os.environ.get('VK_APP_ID')
    client_secret = os.environ.get('VK_CLIENT_SECRET')
    if not app_id:
        return None
    payload = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': app_id,
        'device_id': device_id or '',
        'state': hashlib.md5(str(group_id).encode()).hexdigest(),
    }
    if client_secret:
        payload['client_secret'] = client_secret
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(VK_ID_TOKEN, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.loads(r.read().decode())
    except Exception:
        return None
    new_access = resp.get('access_token')
    if not new_access:
        return None
    new_refresh = resp.get('refresh_token') or refresh_token
    expires_in = resp.get('expires_in')
    expires_at = (datetime.utcnow() + timedelta(seconds=int(expires_in))) if expires_in else None
    cur.execute(
        f"UPDATE {SCHEMA}.vk_oauth_tokens SET access_token = %s, refresh_token = %s, expires_at = %s, updated_at = NOW() WHERE group_id = %s",
        (new_access, new_refresh, expires_at, int(group_id))
    )
    conn.commit()
    return new_access


def _get_admin_token(cur, conn, group_id):
    """Личный токен ПОЛЬЗОВАТЕЛЯ-администратора группы (получен через VK ID
    Authorization Code + PKCE, вход в backend/vk-oauth) — используется для ВСЕХ
    операций Market API: и market.add/edit/delete, и photos.getMarketUploadServer/
    saveMarketPhoto (VK Market API не принимает токен сообщества — error 27
    Group auth). Access token живёт недолго — если истёк или истекает в
    ближайшую минуту, обновляем через refresh_token."""
    cur.execute(f"SELECT access_token, refresh_token, expires_at, device_id FROM {SCHEMA}.vk_oauth_tokens WHERE group_id = %s", (int(group_id),))
    row = cur.fetchone()
    if not row:
        return None
    expires_at = row.get('expires_at')
    if expires_at and expires_at > datetime.utcnow() + timedelta(minutes=1):
        return row['access_token']
    if row.get('refresh_token'):
        refreshed = _refresh_admin_token(cur, conn, group_id, row['refresh_token'], row.get('device_id'))
        if refreshed:
            return refreshed
    return row['access_token']


def _upload_market_photo(group_id, admin_token, image_url):
    """Скачивает фото объекта и загружает его в альбом товаров сообщества VK.
    admin_token — личный токен администратора (см. _get_admin_token).
    Возвращает (photo_id в формате "ownerId_photoId", ошибка)."""
    server_resp, err = _vk_call('photos.getMarketUploadServer', {'group_id': group_id, 'main_photo': 1}, admin_token)
    if err:
        return None, err
    upload_url = (server_resp or {}).get('upload_url')
    if not upload_url:
        return None, 'VK не вернул upload_url'
    try:
        img_bytes = _download(image_url)
    except Exception as e:
        return None, f'Не удалось скачать фото: {e}'
    try:
        upload_result = _multipart_post(upload_url, 'file1', 'photo.jpg', img_bytes, 'image/jpeg')
    except Exception as e:
        return None, f'Ошибка загрузки на сервер VK: {e}'
    if not upload_result.get('photo') or upload_result.get('photo') == '[]':
        return None, f'VK отклонил фото: {upload_result}'
    save_resp, err = _vk_call('photos.saveMarketPhoto', {
        'group_id': group_id,
        'photo': upload_result.get('photo'),
        'server': upload_result.get('server'),
        'hash': upload_result.get('hash'),
    }, admin_token)
    if err:
        return None, err
    photo = (save_resp or [{}])[0]
    if not photo.get('id'):
        return None, f'Не удалось сохранить фото: {save_resp}'
    return f"{photo.get('owner_id')}_{photo.get('id')}", None


def _get_sync_listings(cur, feed):
    """Тот же набор объектов, что уходит в YML-фид VK (флаг export_other) —
    режимы файла и API синхронизации показывают одни и те же товары."""
    where = ["status = 'active'", "(is_visible IS NULL OR is_visible = TRUE)", "export_other = TRUE"]
    args = []
    if feed.get('filter_category'):
        where.append("category = %s"); args.append(feed['filter_category'])
    if feed.get('filter_deal'):
        where.append("deal = %s"); args.append(feed['filter_deal'])
    cur.execute(f"SELECT * FROM {SCHEMA}.listings WHERE {' AND '.join(where)} ORDER BY created_at DESC", tuple(args))
    listings = [dict(r) for r in cur.fetchall()]
    if feed.get('max_listings'):
        listings = listings[:feed['max_listings']]
    return listings


def _upsert_item(cur, feed_id, listing_id, vk_item_id, content_hash, status, error_message):
    cur.execute(
        f"INSERT INTO {SCHEMA}.vk_market_items (feed_id, listing_id, vk_item_id, content_hash, sync_status, error_message, synced_at) "
        f"VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
        f"ON CONFLICT (feed_id, listing_id) DO UPDATE SET "
        f"vk_item_id = COALESCE(EXCLUDED.vk_item_id, {SCHEMA}.vk_market_items.vk_item_id), "
        f"content_hash = EXCLUDED.content_hash, sync_status = EXCLUDED.sync_status, "
        f"error_message = EXCLUDED.error_message, synced_at = NOW()",
        (feed_id, listing_id, vk_item_id, content_hash, status, error_message)
    )


def _sync_feed(cur, conn, feed, group_id):
    feed_id = feed['id']
    try:
        category_map = json.loads(feed['market_category_map']) if feed.get('market_category_map') else {}
    except (TypeError, ValueError):
        category_map = {}

    # Токен администратора (личный, через VK ID Authorization Code + PKCE) нужен
    # для ВСЕХ операций — и market.add/edit/delete, и загрузки фото. Токен
    # сообщества (старый VK_COMMUNITY_TOKEN) больше не используется: VK Market API
    # требует именно пользовательский токен (error 27 "Group auth" при попытке
    # вызвать market.* токеном сообщества).
    admin_token = _get_admin_token(cur, conn, group_id)
    if not admin_token:
        cur.execute(
            f"UPDATE {SCHEMA}.xml_feeds SET vk_last_sync_at = NOW(), vk_last_sync_result = %s WHERE id = %s",
            (json.dumps({'added': 0, 'edited': 0, 'deleted': 0, 'skipped_no_category': 0, 'errors': 1, 'pending': 0,
                         'error': 'Не выполнен вход администратора группы через VK — нажмите «Войти через VK» в настройках фида'}, ensure_ascii=False), feed_id)
        )
        conn.commit()
        return {'added': 0, 'edited': 0, 'deleted': 0, 'skipped_no_category': 0, 'errors': 1, 'pending': 0}

    listings = _get_sync_listings(cur, feed)
    target_ids = {l['id'] for l in listings}

    cur.execute(f"SELECT listing_id, vk_item_id, content_hash FROM {SCHEMA}.vk_market_items WHERE feed_id = %s", (feed_id,))
    existing = {r['listing_id']: r for r in cur.fetchall()}

    summary = {'added': 0, 'edited': 0, 'deleted': 0, 'skipped_no_category': 0, 'errors': 0, 'pending': 0}

    # ── Снятые с публикации объекты — удаляем товар из VK ──
    to_delete_ids = [lid for lid in existing if lid not in target_ids]
    for lid in to_delete_ids[:DELETE_BUDGET]:
        row = existing[lid]
        if row.get('vk_item_id'):
            _, err = _vk_call('market.delete', {'owner_id': f'-{group_id}', 'item_id': row['vk_item_id']}, admin_token)
            if err:
                summary['errors'] += 1
                continue
        cur.execute(f"DELETE FROM {SCHEMA}.vk_market_items WHERE feed_id = %s AND listing_id = %s", (feed_id, lid))
        summary['deleted'] += 1
    conn.commit()

    # ── Добавление / обновление изменившихся объектов ──
    budget = ADD_EDIT_BUDGET
    for l in listings:
        category_id = category_map.get(l.get('category')) or category_map.get('*')
        if not category_id:
            summary['skipped_no_category'] += 1
            continue

        images = _split_images(l)[:5]
        name = _strip_html(l.get('title') or '')[:100]
        description = _strip_html(l.get('description') or '')[:6000]
        price = _total_price(l)
        h = _content_hash(name, description, price, category_id, images)

        prev = existing.get(l['id'])
        if prev and prev.get('content_hash') == h and prev.get('vk_item_id'):
            continue  # без изменений с прошлой синхронизации — пропускаем

        if budget <= 0:
            summary['pending'] += 1
            continue

        if not images:
            _upsert_item(cur, feed_id, l['id'], prev.get('vk_item_id') if prev else None, h, 'error', 'Нет фото — VK требует хотя бы одну фотографию')
            summary['errors'] += 1
            budget -= 1
            conn.commit()
            continue

        photo_ids = []
        photo_err = None
        for img_url in images:
            pid, err = _upload_market_photo(group_id, admin_token, img_url)
            if err:
                photo_err = err
                break
            photo_ids.append(pid)
        if photo_err:
            _upsert_item(cur, feed_id, l['id'], prev.get('vk_item_id') if prev else None, h, 'error', f'Ошибка загрузки фото: {photo_err}')
            summary['errors'] += 1
            budget -= 1
            conn.commit()
            continue

        vk_params = {
            'owner_id': f'-{group_id}',
            'name': name or 'Без названия',
            'description': description,
            'category_id': category_id,
            'price': price,
            'main_photo_id': photo_ids[0],
        }
        if len(photo_ids) > 1:
            vk_params['photo_ids'] = ','.join(photo_ids[1:])

        if prev and prev.get('vk_item_id'):
            vk_params['item_id'] = prev['vk_item_id']
            resp, err = _vk_call('market.edit', vk_params, admin_token)
            action_kind = 'edited'
        else:
            resp, err = _vk_call('market.add', vk_params, admin_token)
            action_kind = 'added'

        if err:
            _upsert_item(cur, feed_id, l['id'], prev.get('vk_item_id') if prev else None, h, 'error', err)
            summary['errors'] += 1
        else:
            item_id = (resp or {}).get('market_item_id') or (prev.get('vk_item_id') if prev else None)
            _upsert_item(cur, feed_id, l['id'], item_id, h, 'synced', None)
            summary[action_kind] += 1

        budget -= 1
        conn.commit()

    cur.execute(
        f"UPDATE {SCHEMA}.xml_feeds SET vk_last_sync_at = NOW(), vk_last_sync_result = %s WHERE id = %s",
        (json.dumps(summary, ensure_ascii=False), feed_id)
    )
    conn.commit()
    return summary


def handler(event, context):
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            if method == 'GET' and params.get('action') == 'my_ip':
                # ДИАГНОСТИКА: исходящий IP-адрес, с которого backend стучится в VK API —
                # нужен, чтобы прописать его в VK ID (Ключи доступа → Конфиденциальное →
                # IP-адрес сервера). Если облачная платформа не даёт статический IP,
                # придётся переключать уровень конфиденциальности приложения на "Публичное".
                try:
                    with urllib.request.urlopen('https://api.ipify.org?format=json', timeout=10) as r:
                        ip_info = json.loads(r.read().decode())
                except Exception as e:
                    ip_info = {'error': str(e)}
                return _ok({'outbound_ip': ip_info.get('ip'), 'raw': ip_info})

            if method == 'GET' and params.get('action') == 'test_market_token':
                # ДИАГНОСТИКА: проверяем личный токен администратора (получен через
                # VK ID Authorization Code + PKCE, см. backend/vk-oauth) на обоих
                # типах методов — market.get (чтение товаров) и getMarketUploadServer
                # (загрузка фото). Оба должны работать одним и тем же токеном.
                group_id = os.environ.get('VK_GROUP_ID')
                if not group_id:
                    return _ok({'ok': False, 'error': 'VK_GROUP_ID не задан'})
                admin_token = _get_admin_token(cur, conn, group_id)
                if not admin_token:
                    return _ok({'ok': False, 'error': 'Администратор группы не подключён — войдите через VK в настройках фида', 'admin_token_present': False})

                r, e = _vk_call('market.get', {'owner_id': f'-{group_id}', 'count': 1}, admin_token)
                photo_result, photo_err = _vk_call('photos.getMarketUploadServer', {'group_id': group_id, 'main_photo': 1}, admin_token)

                return _ok({
                    'market_get_result': r, 'market_get_error': e,
                    'admin_token_present': True,
                    'photo_upload_result': photo_result, 'photo_upload_error': photo_err,
                })

            if method == 'GET' and params.get('action') == 'cron':
                group_id = os.environ.get('VK_GROUP_ID')
                if not group_id:
                    return _ok({'ok': False, 'error': 'VK_GROUP_ID не задан'})
                cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds WHERE format = 'market_vk' AND vk_api_mode = TRUE AND is_active = TRUE")
                feeds = [dict(r) for r in cur.fetchall()]
                results = [{'feed_id': f['id'], 'name': f['name'], **_sync_feed(cur, conn, f, group_id)} for f in feeds]
                return _ok({'ok': True, 'results': results})

            if method == 'GET' and params.get('action') == 'status':
                feed_id = params.get('feed_id')
                if not feed_id:
                    return _err(400, 'feed_id обязателен')
                cur.execute(f"SELECT vk_api_mode, vk_last_sync_at, vk_last_sync_result FROM {SCHEMA}.xml_feeds WHERE id = %s", (int(feed_id),))
                feed = cur.fetchone()
                if not feed:
                    return _err(404, 'Фид не найден')
                cur.execute(f"SELECT sync_status, COUNT(*) as cnt FROM {SCHEMA}.vk_market_items WHERE feed_id = %s GROUP BY sync_status", (int(feed_id),))
                counts = {r['sync_status']: r['cnt'] for r in cur.fetchall()}
                cur.execute(
                    f"SELECT listing_id, error_message FROM {SCHEMA}.vk_market_items WHERE feed_id = %s AND sync_status = 'error' ORDER BY id DESC LIMIT 10",
                    (int(feed_id),)
                )
                errors = [dict(r) for r in cur.fetchall()]
                group_id = os.environ.get('VK_GROUP_ID')
                admin_connected = bool(_get_admin_token(cur, conn, group_id)) if group_id else False
                return _ok({
                    'vk_api_mode': feed['vk_api_mode'],
                    'last_sync_at': feed['vk_last_sync_at'],
                    'last_sync_result': json.loads(feed['vk_last_sync_result']) if feed['vk_last_sync_result'] else None,
                    'counts': counts,
                    'recent_errors': errors,
                    'admin_connected': admin_connected,
                })

            if method == 'POST':
                headers = event.get('headers') or {}
                auth_token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
                user = _get_user(cur, auth_token)
                if not user or user['role'] not in ('admin', 'editor'):
                    return _err(403, 'Нет прав')

                body = json.loads(event.get('body') or '{}')
                feed_id = body.get('feed_id')
                if not feed_id:
                    return _err(400, 'feed_id обязателен')

                cur.execute(f"SELECT * FROM {SCHEMA}.xml_feeds WHERE id = %s AND format = 'market_vk'", (int(feed_id),))
                feed = cur.fetchone()
                if not feed:
                    return _err(404, 'VK-фид не найден')
                feed = dict(feed)

                group_id = os.environ.get('VK_GROUP_ID')
                if not group_id:
                    return _err(400, 'Не настроен секрет VK_GROUP_ID')

                result = _sync_feed(cur, conn, feed, group_id)
                return _ok({'ok': True, **result})

            return _err(400, 'Bad request')
    finally:
        conn.close()