"""
Работа с фотографиями объявлений: перезаливка и удаление водяных знаков.

action=status        — сколько фото ещё на внешних CDN
action=rehost_batch  — пакетная перезаливка на наш CDN (WebP, макс 1920px)
action=remove_watermark — удаление логотипа/водяного знака через Яндекс Vision + PIL
                          POST { action, url, sensitivity? }
                          Returns { url, detected, regions }
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


VISION_URL = 'https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze'


def _get_yandex_keys():
    """API-ключ и folder_id из env или БД."""
    api_key = os.environ.get('AISTUDIO_API_KEY') or os.environ.get('YANDEX_API_KEY', '')
    folder_id = os.environ.get('YANDEX_FOLDER_ID', '')
    if api_key and folder_id:
        return api_key, folder_id
    try:
        conn0 = psycopg2.connect(os.environ['DATABASE_URL'])
        with conn0.cursor(cursor_factory=RealDictCursor) as cur0:
            cur0.execute(f"SELECT yandex_api_key, yandex_folder_id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
            row = cur0.fetchone() or {}
        conn0.close()
        return (
            api_key or row.get('yandex_api_key') or '',
            folder_id or row.get('yandex_folder_id') or '',
        )
    except Exception:
        return api_key, folder_id


def _vision_find_regions(image_b64: str, api_key: str, folder_id: str) -> list:
    """Яндекс Vision — ищет логотипы и текстовые блоки (водяные знаки)."""
    import urllib.request as _ur
    payload = {
        'folderId': folder_id,
        'analyzeSpecs': [{
            'content': image_b64,
            'features': [
                {'type': 'OBJECT_DETECTION', 'objectDetectionConfig': {'objectTypes': ['logo', 'watermark'], 'maxAnnotations': 20}},
                {'type': 'TEXT_DETECTION', 'textDetectionConfig': {'languageCodes': ['ru', 'en']}},
            ],
        }],
    }
    hdrs = {'Authorization': f'Api-Key {api_key}', 'Content-Type': 'application/json'}
    if folder_id:
        hdrs['x-folder-id'] = folder_id
    req = _ur.Request(VISION_URL, data=json.dumps(payload).encode(), headers=hdrs, method='POST')
    with _ur.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode())

    regions = []
    for ann_wrapper in (data.get('results') or [{}])[0].get('results', []):
        for obj in (ann_wrapper.get('objectAnnotations') or {}).get('objects', []):
            if obj.get('confidence', 0) < 0.3:
                continue
            vs = (obj.get('boundingBox') or {}).get('vertices', [])
            if len(vs) >= 2:
                xs = [v.get('x', 0) for v in vs]; ys = [v.get('y', 0) for v in vs]
                regions.append({'x': min(xs), 'y': min(ys), 'w': max(xs)-min(xs), 'h': max(ys)-min(ys), 'conf': obj.get('confidence', 0.5)})
        for block in (ann_wrapper.get('textAnnotations') or {}).get('blocks', []):
            vs = (block.get('boundingBox') or {}).get('vertices', [])
            if len(vs) >= 2:
                xs = [v.get('x', 0) for v in vs]; ys = [v.get('y', 0) for v in vs]
                regions.append({'x': min(xs), 'y': min(ys), 'w': max(xs)-min(xs), 'h': max(ys)-min(ys), 'conf': 0.6})
    return regions


def _erase_regions(image_bytes: bytes, regions: list, sensitivity: float) -> bytes:
    """PIL — стирает найденные регионы (размытие + смешение с фоном)."""
    try:
        from PIL import Image, ImageFilter
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        w, h = img.size
        for r in regions:
            if r.get('conf', 0) < (1 - sensitivity):
                continue
            pad_x, pad_y = int(r['w'] * 0.15), int(r['h'] * 0.15)
            x1, y1 = max(0, r['x'] - pad_x), max(0, r['y'] - pad_y)
            x2, y2 = min(w, r['x'] + r['w'] + pad_x), min(h, r['y'] + r['h'] + pad_y)
            if x2 <= x1 or y2 <= y1:
                continue
            crop = img.crop((x1, y1, x2, y2))
            rw, rh = crop.size
            blurred = crop.filter(ImageFilter.GaussianBlur(radius=max(rw, rh) // 4))
            # Цвет фона — среднее соседних полос
            strips = []
            if y1 > 0: strips.append(img.crop((x1, max(0, y1-20), x2, y1)))
            if y2 < h: strips.append(img.crop((x1, y2, x2, min(h, y2+20))))
            if strips:
                avg = tuple(int(sum(s.resize((1,1), Image.LANCZOS).getpixel((0,0))[i] for s in strips) / len(strips)) for i in range(3))
                from PIL import Image as _PI
                patch = _PI.blend(blurred, _PI.new('RGB', (rw, rh), avg), alpha=0.6)
            else:
                patch = blurred
            img.paste(patch, (x1, y1))
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=92, optimize=True)
        return out.getvalue()
    except Exception as e:
        print(f'[bulk-rehost] erase_regions error: {e}')
        return image_bytes


def handler(event: dict, context) -> dict:
    """Пакетная перезаливка фото и удаление водяных знаков через Яндекс Vision."""
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

            # ── Перегенерация thumb 400px для ВСЕХ объектов ───────────────
            elif action == 'rethumb_batch':
                batch_size = min(int(params.get('batch_size') or body.get('batch_size') or 5), 10)
                offset = int(params.get('offset') or body.get('offset') or 0)
                THUMB_SIDE = 400
                THUMB_QUALITY = 72

                cur.execute(
                    f"SELECT id, image, image_thumb FROM {SCHEMA}.listings "
                    f"WHERE image LIKE '%cdn.poehali.dev%' "
                    f"AND image IS NOT NULL AND image != '' "
                    f"AND status = 'active' "
                    f"ORDER BY id ASC "
                    f"LIMIT {batch_size} OFFSET {offset}"
                )
                listings = cur.fetchall()

                if not listings:
                    return _ok({'done': True, 'processed': 0, 'ok': 0, 'errors': 0})

                s3_client = _s3()
                results = []
                total_ok = total_errors = 0

                for listing in listings:
                    lid = listing['id']
                    main_url = (listing.get('image') or '').strip()
                    if not main_url or 'cdn.poehali.dev' not in main_url:
                        results.append({'id': lid, 'skipped': 'no url'})
                        continue
                    try:
                        raw = _fetch_image(main_url)
                        from PIL import Image as _PI
                        img = _PI.open(io.BytesIO(raw)).convert('RGB')
                        tw, th = img.size

                        # Масштабируем до 400px
                        if max(tw, th) > THUMB_SIDE:
                            t_scale = THUMB_SIDE / max(tw, th)
                            thumb_img = img.resize(
                                (int(tw * t_scale), int(th * t_scale)), _PI.LANCZOS
                            )
                        else:
                            thumb_img = img

                        buf = io.BytesIO()
                        thumb_img.save(buf, format='WEBP', quality=THUMB_QUALITY, method=4)
                        thumb_bytes = buf.getvalue()

                        # Берём токен из основного URL или генерируем новый
                        import re as _re
                        m = _re.search(r'/photos/([^/]+?)(?:_wm)?\.webp', main_url)
                        token = m.group(1) if m else secrets.token_urlsafe(10)
                        thumb_key = f"photos/{token}_thumb.webp"
                        s3_client.put_object(
                            Bucket=BUCKET, Key=thumb_key, Body=thumb_bytes,
                            ContentType='image/webp', CacheControl='public, max-age=31536000'
                        )
                        thumb_url = _cdn_url(thumb_key)

                        cur.execute(
                            f"UPDATE {SCHEMA}.listings "
                            f"SET image_thumb = '{thumb_url.replace(chr(39), chr(39)*2)}', "
                            f"updated_at = NOW() WHERE id = {lid}"
                        )
                        total_ok += 1
                        results.append({
                            'id': lid,
                            'ok': True,
                            'thumb_url': thumb_url,
                            'new_kb': round(len(thumb_bytes) / 1024, 1),
                        })
                    except Exception as e:
                        total_errors += 1
                        results.append({'id': lid, 'error': str(e)[:120]})

                conn.commit()

                cur.execute(
                    f"SELECT COUNT(*) as total FROM {SCHEMA}.listings "
                    f"WHERE status = 'active' AND image LIKE '%cdn.poehali.dev%'"
                )
                total_active = cur.fetchone()['total']

                return _ok({
                    'done': (offset + batch_size) >= total_active,
                    'processed': len(listings),
                    'ok': total_ok,
                    'errors': total_errors,
                    'next_offset': offset + batch_size,
                    'total_active': total_active,
                    'results': results,
                })

            # ── Статус пересжатия (сколько без thumb) ─────────────────────
            elif action == 'recompress_status':
                cur.execute(
                    f"SELECT COUNT(*) as remaining FROM {SCHEMA}.listings "
                    f"WHERE image LIKE '%cdn.poehali.dev%' "
                    f"AND (image_thumb IS NULL OR image_thumb = '') "
                    f"AND image IS NOT NULL AND image != ''"
                )
                row = cur.fetchone()
                cur.execute(f"SELECT COUNT(*) as total FROM {SCHEMA}.listings")
                total_row = cur.fetchone()
                return _ok({
                    'remaining': row['remaining'],
                    'total': total_row['total'],
                })

            # ── Пересжатие своих фото + генерация thumb 800px ─────────────
            elif action == 'recompress_batch':
                offset = int(params.get('offset') or body.get('offset') or 0)
                batch_size = min(int(params.get('batch_size') or body.get('batch_size') or 3), 5)
                THUMB_SIDE = 800
                THUMB_QUALITY = 70

                cur.execute(
                    f"SELECT id, image, images FROM {SCHEMA}.listings "
                    f"WHERE image LIKE '%cdn.poehali.dev%' "
                    f"AND (image_thumb IS NULL OR image_thumb = '') "
                    f"AND image IS NOT NULL AND image != '' "
                    f"ORDER BY id ASC "
                    f"LIMIT {batch_size}"
                )
                listings = cur.fetchall()

                if not listings:
                    return _ok({'done': True, 'processed': 0, 'ok': 0, 'errors': 0, 'remaining': 0, 'next_offset': offset})

                s3_client = _s3()
                results = []
                total_ok = 0
                total_errors = 0

                for listing in listings:
                    lid = listing['id']
                    main_url = (listing.get('image') or '').strip()
                    if not main_url or 'cdn.poehali.dev' not in main_url:
                        results.append({'id': lid, 'skipped': True})
                        continue
                    try:
                        raw = _fetch_image(main_url)
                        from PIL import Image as _PI
                        img = _PI.open(io.BytesIO(raw))
                        w, h = img.size
                        if max(w, h) > MAX_SIDE:
                            scale = MAX_SIDE / max(w, h)
                            img = img.resize((int(w * scale), int(h * scale)), _PI.LANCZOS)
                        img = img.convert('RGB')

                        token = secrets.token_urlsafe(10)

                        # Пересжатый основной файл
                        buf_main = io.BytesIO()
                        img.save(buf_main, format='WEBP', quality=WEBP_QUALITY, method=4)
                        main_key = f"photos/{token}.webp"
                        s3_client.put_object(Bucket=BUCKET, Key=main_key, Body=buf_main.getvalue(),
                                             ContentType='image/webp', CacheControl='public, max-age=31536000')
                        new_main_url = _cdn_url(main_key)

                        # Thumb 800px
                        tw, th = img.size
                        if max(tw, th) > THUMB_SIDE:
                            t_scale = THUMB_SIDE / max(tw, th)
                            thumb_img = img.resize((int(tw * t_scale), int(th * t_scale)), _PI.LANCZOS)
                        else:
                            thumb_img = img
                        buf_thumb = io.BytesIO()
                        thumb_img.save(buf_thumb, format='WEBP', quality=THUMB_QUALITY, method=4)
                        thumb_key = f"photos/{token}_thumb.webp"
                        s3_client.put_object(Bucket=BUCKET, Key=thumb_key, Body=buf_thumb.getvalue(),
                                             ContentType='image/webp', CacheControl='public, max-age=31536000')
                        thumb_url = _cdn_url(thumb_key)

                        # Обновляем images[0]
                        orig_images = (listing.get('images') or '').strip()
                        all_urls = _parse_images(orig_images) or [main_url]
                        all_urls[0] = new_main_url
                        new_images_str = '|'.join(all_urls)

                        cur.execute(
                            f"UPDATE {SCHEMA}.listings "
                            f"SET image = '{new_main_url.replace(chr(39), chr(39)*2)}', "
                            f"images = '{new_images_str.replace(chr(39), chr(39)*2)}', "
                            f"image_thumb = '{thumb_url.replace(chr(39), chr(39)*2)}', "
                            f"updated_at = NOW() WHERE id = {lid}"
                        )
                        total_ok += 1
                        results.append({'id': lid, 'ok': True})
                    except Exception as e:
                        total_errors += 1
                        results.append({'id': lid, 'error': str(e)[:120]})

                conn.commit()

                cur.execute(
                    f"SELECT COUNT(*) as remaining FROM {SCHEMA}.listings "
                    f"WHERE image LIKE '%cdn.poehali.dev%' "
                    f"AND (image_thumb IS NULL OR image_thumb = '') "
                    f"AND image IS NOT NULL AND image != ''"
                )
                remaining = cur.fetchone()['remaining']

                return _ok({
                    'done': remaining == 0,
                    'processed': len(listings),
                    'ok': total_ok,
                    'errors': total_errors,
                    'remaining': remaining,
                    'next_offset': offset + batch_size,
                    'results': results,
                })

            # ── Проставить CacheControl: скачать байты → put_object заново ──
            elif action == 'fix_cache':
                import re as _re
                import urllib.request as _ur
                import threading as _th
                offset_fc = int(params.get('offset') or body.get('offset') or 0)
                batch_fc = min(int(params.get('batch_size') or body.get('batch_size') or 10), 20)
                # Токен для self-chain
                _auth_token = (
                    (event.get('headers') or {}).get('X-Auth-Token') or
                    (event.get('headers') or {}).get('x-auth-token') or ''
                )
                _self_url = f"https://functions.poehali.dev/d86482e4-0555-457a-8063-0d3305c171ff"
                CC = 'public, max-age=31536000'

                # Уникальные CDN-URL из БД (image + image_thumb + images)
                cur.execute(f"""
                    SELECT DISTINCT url FROM (
                        SELECT image AS url FROM {SCHEMA}.listings
                            WHERE image LIKE '%cdn.poehali.dev%' AND image != ''
                        UNION
                        SELECT image_thumb AS url FROM {SCHEMA}.listings
                            WHERE image_thumb LIKE '%cdn.poehali.dev%' AND image_thumb != ''
                        UNION
                        SELECT TRIM(u) AS url
                        FROM {SCHEMA}.listings,
                        LATERAL unnest(string_to_array(images, '|')) AS u
                        WHERE images LIKE '%cdn.poehali.dev%' AND images != ''
                    ) t
                    WHERE url IS NOT NULL AND url != ''
                    ORDER BY url
                    LIMIT {batch_fc} OFFSET {offset_fc}
                """)
                rows = [r['url'] for r in cur.fetchall()]

                cur.execute(f"""
                    SELECT COUNT(DISTINCT url) AS cnt FROM (
                        SELECT image AS url FROM {SCHEMA}.listings
                            WHERE image LIKE '%cdn.poehali.dev%' AND image != ''
                        UNION
                        SELECT image_thumb AS url FROM {SCHEMA}.listings
                            WHERE image_thumb LIKE '%cdn.poehali.dev%' AND image_thumb != ''
                        UNION
                        SELECT TRIM(u) AS url
                        FROM {SCHEMA}.listings,
                        LATERAL unnest(string_to_array(images, '|')) AS u
                        WHERE images LIKE '%cdn.poehali.dev%' AND images != ''
                    ) t WHERE url IS NOT NULL AND url != ''
                """)
                total_fc = cur.fetchone()['cnt']

                s3c = _s3()
                ok_count = err_count = skip_count = 0

                for cdn_url in rows:
                    m = _re.search(r'/bucket/(.+)$', cdn_url)
                    if not m:
                        skip_count += 1
                        continue
                    k = m.group(1)
                    try:
                        # Проверяем текущий CacheControl через head_object
                        head = s3c.head_object(Bucket=BUCKET, Key=k)
                        if head.get('CacheControl') == CC:
                            skip_count += 1
                            continue
                        ct = head.get('ContentType', 'image/webp')

                        # Безопасная перезапись: скачиваем байты → put_object заново
                        # (copy_object не поддерживается провайдером bucket.poehali.dev)
                        resp = _ur.urlopen(cdn_url, timeout=15)
                        data = resp.read()
                        if not data:
                            err_count += 1
                            print(f'[fix_cache] пустые байты: {k}')
                            continue

                        s3c.put_object(
                            Bucket=BUCKET,
                            Key=k,
                            Body=data,
                            ContentType=ct,
                            CacheControl=CC,
                        )
                        ok_count += 1
                        print(f'[fix_cache] ok: {k} ({len(data)} bytes)')
                    except Exception as e:
                        err_count += 1
                        print(f'[fix_cache] err: {k}: {e}')

                next_off = offset_fc + batch_fc
                done = next_off >= total_fc

                # Self-chain: если ещё есть файлы — запускаем следующий батч
                # в фоновом потоке (fire-and-forget), не ждём ответа
                if not done and _auth_token:
                    def _chain():
                        try:
                            _req = _ur.Request(
                                _self_url,
                                data=json.dumps({'action': 'fix_cache', 'offset': next_off, 'batch_size': batch_fc}).encode(),
                                headers={'Content-Type': 'application/json', 'X-Auth-Token': _auth_token},
                                method='POST',
                            )
                            _ur.urlopen(_req, timeout=25)
                        except Exception as _e:
                            print(f'[fix_cache] chain err offset={next_off}: {_e}')
                    _th.Thread(target=_chain, daemon=True).start()

                return _ok({
                    'done': done,
                    'total': total_fc,
                    'processed': len(rows),
                    'ok': ok_count,
                    'skipped': skip_count,
                    'errors': err_count,
                    'next_offset': next_off,
                    'chained': not done and bool(_auth_token),
                })

            # ── Прогнать fix_cache по всем записям за один вызов ─────────────
            elif action == 'fix_cache_all':
                import re as _re
                import urllib.request as _ur
                CC = 'public, max-age=31536000'
                BATCH = 15  # небольшой батч чтобы не упасть по таймауту

                cur.execute(f"""
                    SELECT COUNT(DISTINCT url) AS cnt FROM (
                        SELECT image AS url FROM {SCHEMA}.listings
                            WHERE image LIKE '%cdn.poehali.dev%' AND image != ''
                        UNION
                        SELECT image_thumb AS url FROM {SCHEMA}.listings
                            WHERE image_thumb LIKE '%cdn.poehali.dev%' AND image_thumb != ''
                        UNION
                        SELECT TRIM(u) AS url
                        FROM {SCHEMA}.listings,
                        LATERAL unnest(string_to_array(images, '|')) AS u
                        WHERE images LIKE '%cdn.poehali.dev%' AND images != ''
                    ) t WHERE url IS NOT NULL AND url != ''
                """)
                total_all = cur.fetchone()['cnt']

                start_offset = int(params.get('offset') or body.get('offset') or 0)
                cur.execute(f"""
                    SELECT DISTINCT url FROM (
                        SELECT image AS url FROM {SCHEMA}.listings
                            WHERE image LIKE '%cdn.poehali.dev%' AND image != ''
                        UNION
                        SELECT image_thumb AS url FROM {SCHEMA}.listings
                            WHERE image_thumb LIKE '%cdn.poehali.dev%' AND image_thumb != ''
                        UNION
                        SELECT TRIM(u) AS url
                        FROM {SCHEMA}.listings,
                        LATERAL unnest(string_to_array(images, '|')) AS u
                        WHERE images LIKE '%cdn.poehali.dev%' AND images != ''
                    ) t
                    WHERE url IS NOT NULL AND url != ''
                    ORDER BY url
                    OFFSET {start_offset}
                """)
                all_rows = [r['url'] for r in cur.fetchall()]

                s3c = _s3()
                total_ok = total_skip = total_err = 0

                for cdn_url in all_rows:
                    m = _re.search(r'/bucket/(.+)$', cdn_url)
                    if not m:
                        total_skip += 1
                        continue
                    k = m.group(1)
                    try:
                        head = s3c.head_object(Bucket=BUCKET, Key=k)
                        if head.get('CacheControl') == CC:
                            total_skip += 1
                            continue
                        ct = head.get('ContentType', 'image/webp')
                        resp = _ur.urlopen(cdn_url, timeout=15)
                        data = resp.read()
                        if not data:
                            total_err += 1
                            continue
                        s3c.put_object(Bucket=BUCKET, Key=k, Body=data,
                                       ContentType=ct, CacheControl=CC)
                        total_ok += 1
                    except Exception as e:
                        total_err += 1
                        print(f'[fix_cache_all] err {k}: {e}')

                return _ok({
                    'done': True,
                    'total': total_all,
                    'processed': len(all_rows),
                    'ok': total_ok,
                    'skipped': total_skip,
                    'errors': total_err,
                })

            # ── Удаление водяного знака через Яндекс Vision ────────────────
            elif action == 'remove_watermark':
                url = (body.get('url') or '').strip()
                if not url:
                    return _err(400, 'url обязателен')
                sensitivity = max(0.1, min(0.95, float(body.get('sensitivity') or 0.45)))

                # Скачиваем фото
                try:
                    import base64 as _b64
                    raw = _fetch_image(url)
                except Exception as e:
                    return _err(502, f'Не удалось скачать фото: {str(e)[:150]}')

                image_b64 = _b64.b64encode(raw).decode()
                api_key, folder_id = _get_yandex_keys()

                # Яндекс Vision — ищем логотипы/текст
                regions = []
                vision_used = False
                if api_key and folder_id:
                    try:
                        regions = _vision_find_regions(image_b64, api_key, folder_id)
                        vision_used = True
                        print(f'[bulk-rehost] Vision нашёл {len(regions)} регионов')
                    except Exception as e:
                        print(f'[bulk-rehost] Vision error: {e}')

                detected = len(regions) > 0
                result_bytes = _erase_regions(raw, regions, sensitivity) if detected else raw

                # Заливаем в S3
                try:
                    s3c = _s3()
                    cdn = _upload(s3c, result_bytes, 'image/jpeg')
                except Exception as e:
                    return _err(502, f'Ошибка загрузки S3: {str(e)[:150]}')

                return _ok({
                    'ok': True,
                    'url': cdn,
                    'detected': detected,
                    'vision_used': vision_used,
                    'regions': [{'x': r['x'], 'y': r['y'], 'w': r['w'], 'h': r['h']} for r in regions],
                })

            else:
                return _err(400, f'Неизвестный action: {action}. Доступные: status, rehost_batch, remove_watermark')

    finally:
        conn.close()