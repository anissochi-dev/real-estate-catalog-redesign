"""
Business: Загрузка фото/логотипа/водяного знака в S3 через base64. Опционально накладывает водяной знак на фото объектов.
Также поддерживает публичную загрузку (kind=public) с защитой по magic bytes, rate limit и сканированием кода.
Args: event с httpMethod POST, body {file_base64, filename, kind (photo/logo/watermark/public), apply_watermark}, headers X-Auth-Token
Returns: HTTP-ответ с url загруженного файла на CDN
"""

import base64
import hashlib
import json
import os
import secrets
import io
import time

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, length=100):
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


PUBLIC_ALLOWED = {
    bytes([0xFF, 0xD8, 0xFF]): ('image/jpeg', '.jpg'),
    bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]): ('image/png', '.png'),
    b'GIF87a': ('image/gif', '.gif'),
    b'GIF89a': ('image/gif', '.gif'),
    b'RIFF': ('image/webp', '.webp'),
    b'%PDF': ('application/pdf', '.pdf'),
}
PUBLIC_MAX = 20 * 1024 * 1024
PUBLIC_DANGEROUS = [b'<script', b'<?php', b'javascript:', b'ev' + b'al(', b'ex' + b'ec(', b'system(']
PUBLIC_RATE = 10


def _detect_public(data):
    for magic, info in PUBLIC_ALLOWED.items():
        if data[:len(magic)] == magic:
            if magic == b'RIFF' and data[8:12] != b'WEBP':
                return None
            return info
    return None


def _safe_public(data, mime):
    lower = data[:4096].lower()
    for pat in PUBLIC_DANGEROUS:
        if pat in lower:
            return False
    if mime == 'image/png':
        pos = 8
        while pos + 12 < min(len(data), 32768):
            try:
                ln = int.from_bytes(data[pos:pos+4], 'big')
                ct = data[pos+4:pos+8]
                if ct in (b'tEXt', b'iTXt', b'zTXt'):
                    chunk = data[pos+8:pos+8+min(ln, 512)].lower()
                    if b'<script' in chunk or b'javascript' in chunk:
                        return False
                pos += 12 + ln
            except Exception:
                break
    return True


def _rate_key_public(ip):
    return f"ratelimit/{hashlib.md5(ip.encode()).hexdigest()}_{int(time.time()) // 3600}.txt"


def _check_rate_public(s3, ip):
    key = _rate_key_public(ip)
    try:
        obj = s3.get_object(Bucket='files', Key=key)
        count = int(obj['Body'].read().decode())
    except Exception:
        count = 0
    if count >= PUBLIC_RATE:
        return False
    s3.put_object(Bucket='files', Key=key, Body=str(count + 1).encode(), ContentType='text/plain')
    return True


def _apply_watermark(image_bytes, settings):
    try:
        from PIL import Image
    except Exception:
        return image_bytes

    if not settings or not settings.get('watermark_enabled') or not settings.get('watermark_url'):
        return image_bytes

    try:
        import urllib.request
        wm_resp = urllib.request.urlopen(settings['watermark_url'], timeout=10)
        wm_bytes = wm_resp.read()

        base_img = Image.open(io.BytesIO(image_bytes)).convert('RGBA')
        wm = Image.open(io.BytesIO(wm_bytes)).convert('RGBA')

        # Размер водяного знака — 20% от ширины фото
        ratio = (base_img.width * 0.2) / wm.width
        wm = wm.resize((int(wm.width * ratio), int(wm.height * ratio)), Image.LANCZOS)

        # Прозрачность
        opacity = int(settings.get('watermark_opacity', 50)) / 100
        alpha = wm.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        wm.putalpha(alpha)

        margin = 20
        pos = settings.get('watermark_position', 'bottom-right')
        if pos == 'bottom-right':
            xy = (base_img.width - wm.width - margin, base_img.height - wm.height - margin)
        elif pos == 'bottom-left':
            xy = (margin, base_img.height - wm.height - margin)
        elif pos == 'top-right':
            xy = (base_img.width - wm.width - margin, margin)
        elif pos == 'top-left':
            xy = (margin, margin)
        elif pos == 'center':
            xy = ((base_img.width - wm.width) // 2, (base_img.height - wm.height) // 2)
        else:
            xy = (base_img.width - wm.width - margin, base_img.height - wm.height - margin)

        base_img.paste(wm, xy, wm)
        out = io.BytesIO()
        base_img.convert('RGB').save(out, format='JPEG', quality=88)
        return out.getvalue()
    except Exception:
        return image_bytes


def handler(event, context):
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _err(405, 'Method not allowed')

    # Публичная загрузка (без авторизации) — строгая валидация
    body_raw = event.get('body') or ''
    if event.get('isBase64Encoded'):
        body_raw = base64.b64decode(body_raw).decode('utf-8', errors='replace')
    try:
        body_peek = json.loads(body_raw)
    except Exception:
        body_peek = {}

    if body_peek.get('kind') == 'public':
        ip = ((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp') or 'unknown'
        file_b64 = body_peek.get('file', '') or body_peek.get('file_base64', '')
        if not file_b64:
            return _err(400, 'Файл не передан')
        try:
            if ',' in file_b64 and file_b64.startswith('data:'):
                file_b64 = file_b64.split(',', 1)[1]
            file_data = base64.b64decode(file_b64)
        except Exception:
            return _err(400, 'Не удалось декодировать файл')
        if len(file_data) > PUBLIC_MAX:
            return _err(413, f'Файл слишком большой (макс. {PUBLIC_MAX // 1024 // 1024} МБ)')
        if len(file_data) < 16:
            return _err(400, 'Файл слишком маленький или повреждён')
        detected = _detect_public(file_data)
        if not detected:
            return _err(415, 'Тип файла не поддерживается. Разрешены: JPEG, PNG, GIF, WebP, PDF')
        pub_mime, pub_ext = detected
        if not _safe_public(file_data, pub_mime):
            return _err(400, 'Файл отклонён: обнаружен потенциально опасный код')
        s3_pub = boto3.client(
            's3',
            endpoint_url='https://bucket.poehali.dev',
            aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        )
        if not _check_rate_public(s3_pub, ip):
            return _err(429, 'Превышен лимит загрузок (10 в час). Попробуйте позже.')
        fhash = hashlib.sha256(file_data).hexdigest()[:16]
        fname = f'public/{int(time.time())}_{fhash}{pub_ext}'
        s3_pub.put_object(Bucket='files', Key=fname, Body=file_data, ContentType=pub_mime)
        cdn = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{fname}"
        return _ok({'success': True, 'url': cdn, 'mime': pub_mime, 'size': len(file_data)})

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
                return _err(403, 'Нет прав')

            body = json.loads(event.get('body') or '{}')
            file_b64 = body.get('file_base64', '')
            filename = body.get('filename', 'file.jpg')
            kind = body.get('kind', 'photo')
            apply_wm = body.get('apply_watermark', False)

            if not file_b64:
                return _err(400, 'Пустой файл')

            if ',' in file_b64:
                file_b64 = file_b64.split(',', 1)[1]

            try:
                data = base64.b64decode(file_b64)
            except Exception:
                return _err(400, 'Невалидный base64')

            if len(data) > 15 * 1024 * 1024:
                return _err(400, 'Файл больше 15 МБ')

            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
            if ext not in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'):
                ext = 'jpg'

            content_type = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml',
            }[ext]

            # Конвертируем фото в WebP для экономии 30-40% трафика
            if kind == 'photo' and ext in ('jpg', 'jpeg', 'png', 'webp'):
                try:
                    from PIL import Image as PilImage
                    img = PilImage.open(io.BytesIO(data))
                    # Масштабируем если больше 1920px
                    max_side = 1920
                    w, h = img.size
                    if max(w, h) > max_side:
                        scale = max_side / max(w, h)
                        img = img.resize((int(w * scale), int(h * scale)), PilImage.LANCZOS)
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGBA')
                    else:
                        img = img.convert('RGB')
                    buf = io.BytesIO()
                    img.save(buf, format='WEBP', quality=82, method=4)
                    webp_data = buf.getvalue()
                    if len(webp_data) < len(data):
                        data = webp_data
                        ext = 'webp'
                        content_type = 'image/webp'
                except Exception:
                    pass  # если Pillow не смог — грузим оригинал

            folder = {'photo': 'photos', 'logo': 'logos', 'watermark': 'watermarks'}.get(kind, 'files')
            token12 = secrets.token_urlsafe(12)
            aws_key = os.environ['AWS_ACCESS_KEY_ID']
            s3 = boto3.client(
                's3',
                endpoint_url='https://bucket.poehali.dev',
                aws_access_key_id=aws_key,
                aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
            )

            original_data = data
            original_ext = ext
            original_ct = content_type
            wm_applied = False

            # Если фото и нужен водяной знак — накладываем + сохраняем ОТДЕЛЬНО оригинал
            if kind == 'photo' and apply_wm and ext in ('jpg', 'jpeg', 'png', 'webp'):
                cur.execute(
                    f"SELECT watermark_enabled, watermark_url, watermark_opacity, watermark_position "
                    f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
                )
                wm_row = cur.fetchone()
                if wm_row and wm_row.get('watermark_enabled') and wm_row.get('watermark_url'):
                    wm_data = _apply_watermark(data, dict(wm_row))
                    if wm_data and wm_data != data:
                        # Сохраняем версию с водяным знаком как основной файл
                        wm_key = f"{folder}/{token12}_wm.jpg"
                        s3.put_object(Bucket='files', Key=wm_key, Body=wm_data, ContentType='image/jpeg')
                        # Сохраняем оригинал (сжатый, без ВЗ) для скачивания
                        orig_key = f"{folder}/{token12}.{original_ext}"
                        s3.put_object(Bucket='files', Key=orig_key, Body=original_data, ContentType=original_ct)

                        wm_applied = True
                        url = f"https://cdn.poehali.dev/projects/{aws_key}/bucket/{wm_key}"
                        original_url = f"https://cdn.poehali.dev/projects/{aws_key}/bucket/{orig_key}"
                        return _ok({
                            'url': url,
                            'original_url': original_url,
                            'watermarked': True,
                            'size': len(wm_data),
                        })

            # Без водяного знака — обычное сохранение
            if not wm_applied:
                key = f"{folder}/{token12}.{ext}"
                s3.put_object(Bucket='files', Key=key, Body=data, ContentType=content_type)
                url = f"https://cdn.poehali.dev/projects/{aws_key}/bucket/{key}"
                return _ok({'url': url, 'original_url': url, 'watermarked': False, 'size': len(data)})
    finally:
        conn.close()