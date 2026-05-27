"""
Пакетная перезаливка фотографий объявлений: скачивает с внешних доменов,
конвертирует в WebP (качество 82, макс 1920px), заливает на наш CDN,
обновляет URL в БД. Обрабатывает по batch_size объявлений за вызов.
Args: action=rehost_batch&offset=0&batch_size=20 (GET) или POST body
Returns: JSON с прогрессом и результатами
"""

import io
import json
import os
import re
import secrets
import urllib.request
import urllib.error

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_BASE = 'https://cdn.poehali.dev'
WEBP_QUALITY = 82
MAX_SIDE = 1920
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
FETCH_TIMEOUT = 8  # жёсткий таймаут на одно фото


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _s3():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _project_id():
    return os.environ['AWS_ACCESS_KEY_ID']


def _cdn_url(key):
    return f"{CDN_BASE}/projects/{_project_id()}/bucket/{key}"


def _parse_images(raw):
    if not raw:
        return []
    if '|' in raw:
        return [u.strip() for u in raw.split('|') if u.strip()]
    if ',' in raw and 'http' in raw:
        return [u.strip() for u in raw.split(',') if u.strip().startswith('http')]
    if raw.startswith('http'):
        return [raw.strip()]
    return []


def _is_our_cdn(url):
    return 'cdn.poehali.dev' in url


def _fetch_image(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; ImageOptimizer/1.0)',
        'Accept': 'image/*,*/*',
    })
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        data = resp.read(MAX_FILE_SIZE)
    return data


def _to_webp(data):
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    if max(w, h) > MAX_SIDE:
        scale = MAX_SIDE / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
    else:
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='WEBP', quality=WEBP_QUALITY, method=4)
    webp = buf.getvalue()
    return webp if len(webp) < len(data) else data, 'image/webp'


def _upload(s3_client, data, mime, folder='photos'):
    token = secrets.token_urlsafe(10)
    ext = 'webp' if mime == 'image/webp' else 'jpg'
    key = f"{folder}/{token}.{ext}"
    s3_client.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=data,
        ContentType=mime,
        CacheControl='public, max-age=31536000',
    )
    return _cdn_url(key)


def _rehost_listing(listing, s3_client):
    listing_id = listing['id']
    orig_image = listing.get('image') or ''
    orig_images = listing.get('images') or ''

    all_urls = _parse_images(orig_images) or _parse_images(orig_image)
    if not all_urls:
        return {'id': listing_id, 'skipped': True, 'reason': 'нет фото'}

    # Проверяем нужно ли вообще что-то делать
    external = [u for u in all_urls if not _is_our_cdn(u)]
    if not external:
        return {'id': listing_id, 'skipped': True, 'reason': 'все фото уже на CDN'}

    url_map = {}   # old_url -> new_url or None (None = битая ссылка, убрать)
    errors = []

    for url in all_urls:
        if _is_our_cdn(url):
            url_map[url] = url  # наш CDN — не трогаем
            continue
        try:
            raw = _fetch_image(url)
            if len(raw) < 100:
                errors.append(f"id={listing_id} {url}: слишком маленький файл — удалена")
                url_map[url] = None  # убираем битую ссылку
                continue
            webp_data, mime = _to_webp(raw)
            new_url = _upload(s3_client, webp_data, mime)
            url_map[url] = new_url
        except Exception as e:
            err_str = str(e)[:120]
            errors.append(f"id={listing_id} {url}: {err_str} — удалена")
            url_map[url] = None  # 404/таймаут — убираем битую ссылку

    # Собираем новые списки, пропуская None (битые)
    new_urls = [url_map[u] for u in all_urls if url_map.get(u) is not None]
    new_images = '|'.join(new_urls)
    new_image = new_urls[0] if new_urls else ''

    converted = sum(1 for u in all_urls if _is_our_cdn(url_map.get(u, '') or ''))

    return {
        'id': listing_id,
        'converted': converted,
        'errors': errors,
        'new_image': new_image,
        'new_images': new_images,
    }


def handler(event: dict, context) -> dict:
    """Пакетная перезаливка фото объявлений с внешних CDN на наш S3 в формате WebP."""
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            headers = event.get('headers') or {}
            token = (
                headers.get('X-Auth-Token') or headers.get('x-auth-token')
                or headers.get('X-Authorization') or headers.get('x-authorization') or ''
            )
            if token.startswith('Bearer '):
                token = token[7:]
            t = (token or '').replace("'", "''")[:100]
            cur.execute(
                f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
            )
            user = cur.fetchone()
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor', 'director'):
                return _err(403, 'Нет прав')

            params = event.get('queryStringParameters') or {}
            body = {}
            if method == 'POST':
                try:
                    body = json.loads(event.get('body') or '{}')
                except Exception:
                    pass

            action = params.get('action') or body.get('action') or 'status'

            # ── Статус: сколько ещё внешних фото ──────────────────────────
            if action == 'status':
                cur.execute(
                    f"SELECT COUNT(*) as total FROM {SCHEMA}.listings "
                    f"WHERE (image NOT LIKE '%cdn.poehali.dev%' OR images NOT LIKE '%cdn.poehali.dev%') "
                    f"AND (image IS NOT NULL AND image != '')"
                )
                row = cur.fetchone()
                cur.execute(
                    f"SELECT COUNT(*) as external FROM {SCHEMA}.listings "
                    f"WHERE image NOT LIKE '%cdn.poehali.dev%' "
                    f"AND image IS NOT NULL AND image != ''"
                )
                ext_row = cur.fetchone()
                cur.execute(f"SELECT COUNT(*) as total_all FROM {SCHEMA}.listings")
                all_row = cur.fetchone()
                return _ok({
                    'total_listings': all_row['total_all'],
                    'external_photos': ext_row['external'],
                    'message': f"Объявлений с внешними фото: {ext_row['external']} из {all_row['total_all']}",
                })

            # ── Пакетная перезаливка ───────────────────────────────────────
            elif action == 'rehost_batch':
                offset = int(params.get('offset') or body.get('offset') or 0)
                batch_size = min(int(params.get('batch_size') or body.get('batch_size') or 3), 5)

                # Берём объявления с внешними фото
                cur.execute(
                    f"SELECT id, image, images FROM {SCHEMA}.listings "
                    f"WHERE image NOT LIKE '%cdn.poehali.dev%' "
                    f"AND image IS NOT NULL AND image != '' "
                    f"ORDER BY id ASC "
                    f"LIMIT {batch_size} OFFSET {offset}"
                )
                listings = cur.fetchall()

                if not listings:
                    return _ok({
                        'done': True,
                        'message': 'Все фото уже перенесены на CDN!',
                        'processed': 0,
                    })

                s3_client = _s3()
                results = []
                total_converted = 0
                total_errors = 0

                for listing in listings:
                    result = _rehost_listing(dict(listing), s3_client)
                    results.append(result)

                    if result.get('converted', 0) > 0:
                        total_converted += result['converted']
                        lid = result['id']
                        new_img = (result.get('new_image') or '').replace("'", "''")
                        new_imgs = (result.get('new_images') or '').replace("'", "''")
                        cur.execute(
                            f"UPDATE {SCHEMA}.listings "
                            f"SET image = '{new_img}', images = '{new_imgs}', updated_at = NOW() "
                            f"WHERE id = {lid}"
                        )

                    if result.get('errors'):
                        total_errors += len(result['errors'])

                conn.commit()

                # Сколько осталось
                cur.execute(
                    f"SELECT COUNT(*) as remaining FROM {SCHEMA}.listings "
                    f"WHERE image NOT LIKE '%cdn.poehali.dev%' "
                    f"AND image IS NOT NULL AND image != ''"
                )
                remaining = cur.fetchone()['remaining']

                return _ok({
                    'done': remaining == 0,
                    'offset': offset,
                    'batch_size': batch_size,
                    'processed': len(listings),
                    'converted_photos': total_converted,
                    'errors': total_errors,
                    'remaining_listings': remaining,
                    'next_offset': offset + batch_size,
                    'results': results,
                    'summary': (
                        f"Обработано {len(listings)} объявлений, "
                        f"сконвертировано {total_converted} фото, "
                        f"ошибок {total_errors}. "
                        f"Осталось: {remaining} объявлений."
                    ),
                })

            else:
                return _err(400, f'Неизвестный action: {action}. Доступные: status, rehost_batch')

    finally:
        conn.close()