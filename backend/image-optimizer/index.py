"""
Сканирование, сжатие и удаление неиспользуемых фотографий в S3.
Используется ИИ-ассистентом через action: scan_images, optimize_images, delete_unused_images.

Args: event с httpMethod GET/POST, body {action, keys?}, headers X-Auth-Token
Returns: JSON с результатами операции
"""

import io
import json
import os

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_PREFIX = 'https://cdn.poehali.dev/projects'

# Порог сжатия: файлы крупнее этого размера (байт) считаются кандидатами
COMPRESS_THRESHOLD = 200 * 1024  # 200 KB
# Качество JPEG при сжатии (lossless-подобное — высокое качество)
JPEG_QUALITY = 85
# Максимальная сторона фото после ресайза (если больше — уменьшаем)
MAX_SIDE = 2000


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _safe(s, n=200):
    return (s or '').replace("'", "''")[:n]


def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key: str) -> str:
    return f"{CDN_PREFIX}/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _key_from_url(url: str) -> str | None:
    """Извлекает S3-ключ из CDN или bucket URL."""
    if not url:
        return None
    markers = ['/bucket/', '/files/']
    for m in markers:
        idx = url.find(m)
        if idx != -1:
            return url[idx + len(m):]
    # Если URL уже выглядит как ключ (без http)
    if not url.startswith('http') and '/' in url:
        return url
    return None


def _compress_image(data: bytes) -> tuple[bytes, str]:
    """
    Сжимает изображение: ресайз если больше MAX_SIDE, конвертация в JPEG.
    Возвращает (сжатые байты, mime-тип).
    """
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    original_mode = img.mode

    # Ресайз если нужно
    w, h = img.size
    if max(w, h) > MAX_SIDE:
        ratio = MAX_SIDE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    # Конвертируем в RGB для сохранения как JPEG
    if original_mode in ('RGBA', 'P', 'LA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode in ('RGBA', 'LA'):
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    elif original_mode != 'RGB':
        img = img.convert('RGB')

    out = io.BytesIO()
    img.save(out, format='JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue(), 'image/jpeg'


def _get_all_s3_keys(s3) -> dict[str, int]:
    """Возвращает {key: size_bytes} для всех файлов в photos/."""
    result = {}
    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=BUCKET, Prefix='photos/'):
        for obj in page.get('Contents', []):
            result[obj['Key']] = obj['Size']
    return result


def _get_used_keys(cur) -> set[str]:
    """Собирает все S3-ключи, которые реально используются в БД (listings + settings)."""
    used = set()

    # Поле image (одна картинка)
    cur.execute(f"SELECT image FROM {SCHEMA}.listings WHERE image IS NOT NULL AND image != ''")
    for row in cur.fetchall():
        k = _key_from_url(row['image'])
        if k:
            used.add(k)

    # Поле images (массив или строка с разделителями)
    cur.execute(f"SELECT images FROM {SCHEMA}.listings WHERE images IS NOT NULL AND images != ''")
    for row in cur.fetchall():
        raw = row['images']
        if not raw:
            continue
        if isinstance(raw, list):
            urls = raw
        elif isinstance(raw, str):
            sep = '|' if '|' in raw else ','
            urls = [u.strip() for u in raw.split(sep) if u.strip()]
        else:
            urls = []
        for url in urls:
            k = _key_from_url(url)
            if k:
                used.add(k)

    # Также смотрим logos/ и watermarks/ из settings
    try:
        cur.execute(f"SELECT logo_url, watermark_url, og_image_url, favicon_url, apple_touch_icon_url FROM {SCHEMA}.settings LIMIT 1")
        row = cur.fetchone()
        if row:
            for v in row.values():
                k = _key_from_url(v or '')
                if k:
                    used.add(k)
    except Exception:
        pass

    # Новости
    try:
        cur.execute(f"SELECT image_url FROM {SCHEMA}.news WHERE image_url IS NOT NULL AND image_url != ''")
        for row in cur.fetchall():
            k = _key_from_url(row['image_url'])
            if k:
                used.add(k)
    except Exception:
        pass

    return used


def _action_scan(cur, s3) -> dict:
    """Сканирует S3 и БД, возвращает список кандидатов на сжатие и удаление."""
    all_keys = _get_all_s3_keys(s3)
    used_keys = _get_used_keys(cur)

    unused = []
    to_compress = []
    ok_files = []

    for key, size in all_keys.items():
        # Пропускаем оригиналы с ВЗ (они нужны для повторного наложения)
        if key not in used_keys:
            unused.append({'key': key, 'size': size, 'url': _cdn_url(key)})
        elif size > COMPRESS_THRESHOLD:
            to_compress.append({'key': key, 'size': size, 'url': _cdn_url(key), 'size_kb': round(size / 1024)})
        else:
            ok_files.append(key)

    total_unused_bytes = sum(f['size'] for f in unused)
    total_compress_bytes = sum(f['size'] for f in to_compress)

    return {
        'total_in_s3': len(all_keys),
        'total_used': len(used_keys),
        'unused_count': len(unused),
        'unused_size_kb': round(total_unused_bytes / 1024),
        'compress_candidates': len(to_compress),
        'compress_total_kb': round(total_compress_bytes / 1024),
        'ok_count': len(ok_files),
        'unused': unused[:50],        # макс 50 для ответа
        'to_compress': to_compress[:50],
    }


def _action_optimize(s3, keys: list[str]) -> dict:
    """Скачивает каждый файл, сжимает, заливает обратно под тем же ключом."""
    try:
        from PIL import Image as _chk  # noqa: F401
    except ImportError:
        return {'error': 'Pillow не установлен'}

    results = []
    total_saved = 0

    for key in keys[:20]:  # макс 20 за раз
        try:
            obj = s3.get_object(Bucket=BUCKET, Key=key)
            original_bytes = obj['Body'].read()
            original_size = len(original_bytes)

            # Проверяем что это изображение
            mime = obj.get('ContentType', '')
            if not mime.startswith('image/') and not key.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                results.append({'key': key, 'skipped': True, 'reason': 'не изображение'})
                continue

            compressed, new_mime = _compress_image(original_bytes)
            new_size = len(compressed)

            # Сжимаем только если реально уменьшилось хотя бы на 5%
            if new_size >= original_size * 0.95:
                results.append({'key': key, 'skipped': True, 'reason': 'уже оптимально', 'size_kb': round(original_size / 1024)})
                continue

            # Заливаем обратно под тем же ключом (URL не меняется)
            s3.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=compressed,
                ContentType=new_mime,
            )

            saved = original_size - new_size
            total_saved += saved
            results.append({
                'key': key,
                'ok': True,
                'original_kb': round(original_size / 1024),
                'new_kb': round(new_size / 1024),
                'saved_kb': round(saved / 1024),
                'url': _cdn_url(key),
            })

        except Exception as e:
            results.append({'key': key, 'error': str(e)})

    return {
        'processed': len(results),
        'total_saved_kb': round(total_saved / 1024),
        'results': results,
    }


def _action_delete_unused(s3, keys: list[str]) -> dict:
    """Удаляет файлы из S3 по списку ключей."""
    deleted = []
    errors = []

    for key in keys[:100]:  # макс 100 за раз
        try:
            s3.delete_object(Bucket=BUCKET, Key=key)
            deleted.append(key)
        except Exception as e:
            errors.append({'key': key, 'error': str(e)})

    return {
        'deleted_count': len(deleted),
        'deleted': deleted,
        'errors': errors,
    }


def handler(event: dict, context) -> dict:
    """Оптимизатор изображений для ИИ-ассистента: сканирование, сжатие, удаление неиспользуемых."""
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
            # Авторизация
            headers = event.get('headers') or {}
            token = (
                headers.get('X-Auth-Token') or headers.get('x-auth-token')
                or headers.get('X-Authorization') or headers.get('x-authorization') or ''
            )
            if token.startswith('Bearer '):
                token = token[7:]
            t = _safe(token, 100)
            cur.execute(
                f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
            )
            user = cur.fetchone()
            if not user:
                return _err(401, 'Требуется авторизация')
            if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
                return _err(403, 'Нет прав')

            s3 = _s3_client()
            params = event.get('queryStringParameters') or {}
            body = {}
            if method == 'POST':
                try:
                    body = json.loads(event.get('body') or '{}')
                except Exception:
                    body = {}

            action = params.get('action') or body.get('action') or 'scan'

            if action == 'scan':
                result = _action_scan(cur, s3)
                return _ok(result)

            elif action == 'optimize':
                keys = body.get('keys') or []
                if not keys:
                    return _err(400, 'Нужен список keys для сжатия')
                result = _action_optimize(s3, keys)
                return _ok(result)

            elif action == 'delete':
                if user['role'] not in ('admin', 'editor', 'manager', 'director'):
                    return _err(403, 'Недостаточно прав для удаления')
                keys = body.get('keys') or []
                if not keys:
                    return _err(400, 'Нужен список keys для удаления')
                result = _action_delete_unused(s3, keys)
                return _ok(result)

            else:
                return _err(400, f'Неизвестное действие: {action}')

    finally:
        conn.close()
