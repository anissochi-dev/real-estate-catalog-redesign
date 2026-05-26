"""
Сканирование, сжатие и удаление неиспользуемых фотографий в S3.
Используется ИИ-ассистентом через action: scan_images, optimize_images, delete_unused_images.

Реальная картина хранилища:
- Большинство фото объектов хранятся на внешних доменах (2bishop.ru и др.) — их не трогаем
- Наши фото: cdn.poehali.dev/projects/{PROJECT_ID}/bucket/{prefix}/{filename}
  Соответствующий S3-ключ: {prefix}/{filename}  (photos/, logos/, watermarks/)
- settings поля могут быть как строкой URL, так и JSON-строкой вида "['url']" или "[]"

Args: event с httpMethod GET/POST, body {action, keys?}, headers X-Auth-Token
Returns: JSON с результатами операции
"""

import io
import json
import os
import re

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'
S3_ENDPOINT = 'https://bucket.poehali.dev'
CDN_BASE = 'https://cdn.poehali.dev'

# Порог сжатия: файлы крупнее этого размера считаются кандидатами
COMPRESS_THRESHOLD = 150 * 1024   # 150 KB
# Качество JPEG при сжатии — высокое, минимальные потери
JPEG_QUALITY = 85
# Максимальная сторона фото (px). Крупнее — уменьшаем с сохранением пропорций
MAX_SIDE = 2000
# Сканируемые папки S3
S3_PREFIXES = ['photos/', 'logos/', 'watermarks/', 'files/']
# Минимальный выигрыш от сжатия — иначе пропускаем
MIN_SAVINGS_PCT = 0.05


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


def _project_id() -> str:
    return os.environ['AWS_ACCESS_KEY_ID']


def _cdn_url(key: str) -> str:
    return f"{CDN_BASE}/projects/{_project_id()}/bucket/{key}"


def _extract_urls_from_value(v) -> list:
    """
    Извлекает все URL из любого формата поля:
    - строка URL: "https://..."
    - строка с разделителями: "url1|url2" или "url1,url2"
    - JSON-строка массива: "['url1', 'url2']" или '["url1"]' или "[]"
    - уже список Python
    """
    if not v:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if x]

    s = str(v).strip()
    if not s or s in ('[]', '{}', 'null', 'None', ''):
        return []

    # JSON-строка массива: ['url'] или ["url"]
    if s.startswith('['):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x]
        except Exception:
            pass
        # Попытка с заменой одинарных кавычек
        try:
            parsed = json.loads(s.replace("'", '"'))
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x]
        except Exception:
            pass
        # Грубое извлечение URL из строки
        return re.findall(r'https?://[^\s\'">,\]]+', s)

    # Строка с разделителями
    if '|' in s:
        return [u.strip() for u in s.split('|') if u.strip()]
    if ',' in s and 'http' in s:
        return [u.strip() for u in s.split(',') if u.strip().startswith('http')]

    # Одиночный URL
    if s.startswith('http'):
        return [s]

    return []


def _key_from_url(url: str) -> str | None:
    """
    Извлекает S3-ключ (путь внутри bucket) из CDN-URL нашего проекта.
    Возвращает None если URL не принадлежит нашему CDN.

    Наш формат: https://cdn.poehali.dev/projects/{project_id}/bucket/{key}
    """
    if not url or not isinstance(url, str):
        return None

    url = url.strip()

    # Только наш CDN
    if 'cdn.poehali.dev' not in url:
        return None

    # Ищем паттерн /bucket/ в URL
    marker = '/bucket/'
    idx = url.find(marker)
    if idx != -1:
        key = url[idx + len(marker):]
        # Убираем query string если есть
        key = key.split('?')[0].split('#')[0]
        if key:
            return key

    return None


def _get_all_s3_keys(s3) -> dict:
    """Возвращает {key: size_bytes} для всех файлов во всех наших папках S3."""
    result = {}
    paginator = s3.get_paginator('list_objects_v2')
    for prefix in S3_PREFIXES:
        try:
            for page in paginator.paginate(Bucket=BUCKET, Prefix=prefix):
                for obj in page.get('Contents', []):
                    result[obj['Key']] = obj['Size']
        except Exception:
            pass
    return result


def _get_used_keys(cur) -> set:
    """
    Собирает все S3-ключи, которые реально используются в БД.
    Только ключи нашего CDN — внешние URL (2bishop.ru и др.) игнорируем.
    """
    used = set()

    def _add_from_value(v):
        for url in _extract_urls_from_value(v):
            k = _key_from_url(url)
            if k:
                used.add(k)

    # listings.image (одиночное фото)
    try:
        cur.execute(
            f"SELECT image FROM {SCHEMA}.listings "
            f"WHERE image IS NOT NULL AND image != '' AND image LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add_from_value(row['image'])
    except Exception:
        pass

    # listings.images (несколько фото, разделители | или ,)
    try:
        cur.execute(
            f"SELECT images FROM {SCHEMA}.listings "
            f"WHERE images IS NOT NULL AND images != '' AND images LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add_from_value(row['images'])
    except Exception:
        pass

    # settings — все поля с URL
    try:
        cur.execute(
            f"SELECT logo_url, watermark_url, og_image_url, favicon_url, "
            f"apple_touch_icon_url FROM {SCHEMA}.settings LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            for v in row.values():
                _add_from_value(v)
    except Exception:
        pass

    # news.image_url
    try:
        cur.execute(
            f"SELECT image_url FROM {SCHEMA}.news "
            f"WHERE image_url IS NOT NULL AND image_url != '' AND image_url LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add_from_value(row['image_url'])
    except Exception:
        pass

    # pages — если есть поле с изображениями
    try:
        cur.execute(
            f"SELECT og_image FROM {SCHEMA}.seo_pages "
            f"WHERE og_image IS NOT NULL AND og_image != '' AND og_image LIKE '%cdn.poehali%'"
        )
        for row in cur.fetchall():
            _add_from_value(row['og_image'])
    except Exception:
        pass

    return used


def _compress_image(data: bytes) -> tuple:
    """
    Сжимает изображение без потери качества:
    - Ресайз только если сторона > MAX_SIDE (с сохранением пропорций)
    - Конвертация в progressive JPEG, качество JPEG_QUALITY
    Возвращает (bytes, mime_type).
    """
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    original_mode = img.mode

    # Ресайз только если реально большое
    w, h = img.size
    if max(w, h) > MAX_SIDE:
        ratio = MAX_SIDE / max(w, h)
        new_w, new_h = int(w * ratio), int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    # Конвертация в RGB (JPEG не поддерживает прозрачность)
    if img.mode in ('RGBA', 'LA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode == 'P':
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    out = io.BytesIO()
    img.save(out, format='JPEG', quality=JPEG_QUALITY, optimize=True, progressive=True)
    return out.getvalue(), 'image/jpeg'


# ── Основные операции ─────────────────────────────────────────────────────────

def _action_scan(cur, s3) -> dict:
    """Сканирует S3 и БД, возвращает подробный отчёт."""
    all_keys = _get_all_s3_keys(s3)
    used_keys = _get_used_keys(cur)

    unused, to_compress, already_ok = [], [], []

    for key, size in all_keys.items():
        if key not in used_keys:
            unused.append({
                'key': key,
                'size_kb': round(size / 1024),
                'url': _cdn_url(key),
            })
        elif size > COMPRESS_THRESHOLD:
            to_compress.append({
                'key': key,
                'size_kb': round(size / 1024),
                'url': _cdn_url(key),
            })
        else:
            already_ok.append(key)

    unused_kb = sum(f['size_kb'] for f in unused)
    compress_kb = sum(f['size_kb'] for f in to_compress)

    return {
        'total_in_s3': len(all_keys),
        'total_used_our_cdn': len(used_keys),
        'unused_count': len(unused),
        'unused_size_kb': unused_kb,
        'compress_candidates': len(to_compress),
        'compress_total_kb': compress_kb,
        'already_ok_count': len(already_ok),
        'unused': unused[:100],
        'to_compress': to_compress[:100],
        'summary': (
            f"В S3: {len(all_keys)} файлов. "
            f"Неиспользуемых: {len(unused)} ({unused_kb} KB). "
            f"Кандидатов на сжатие: {len(to_compress)} ({compress_kb} KB). "
            f"Уже оптимальных: {len(already_ok)}."
        ),
    }


def _action_optimize(s3, keys: list) -> dict:
    """Скачивает каждый файл, сжимает, заливает обратно под тем же ключом."""
    try:
        from PIL import Image as _PIL_test  # noqa
    except ImportError:
        return {'error': 'Pillow не установлен'}

    results = []
    total_saved = 0

    for key in keys[:50]:  # макс 50 за один вызов
        try:
            obj = s3.get_object(Bucket=BUCKET, Key=key)
            orig_bytes = obj['Body'].read()
            orig_size = len(orig_bytes)
            content_type = obj.get('ContentType', '')

            # Пропускаем не-изображения
            is_image = (
                content_type.startswith('image/')
                or key.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))
            )
            if not is_image:
                results.append({'key': key, 'skipped': True, 'reason': 'не изображение'})
                continue

            # GIF не сжимаем — испортим анимацию
            if key.lower().endswith('.gif') or content_type == 'image/gif':
                results.append({'key': key, 'skipped': True, 'reason': 'GIF — пропущен'})
                continue

            compressed, new_mime = _compress_image(orig_bytes)
            new_size = len(compressed)

            # Не заливаем если экономия меньше MIN_SAVINGS_PCT
            if new_size >= orig_size * (1 - MIN_SAVINGS_PCT):
                results.append({
                    'key': key,
                    'skipped': True,
                    'reason': 'уже оптимально',
                    'size_kb': round(orig_size / 1024),
                })
                continue

            # Заливаем обратно под тем же ключом — URL не меняется
            s3.put_object(
                Bucket=BUCKET,
                Key=key,
                Body=compressed,
                ContentType=new_mime,
                CacheControl='public, max-age=31536000',
            )

            saved = orig_size - new_size
            total_saved += saved
            results.append({
                'key': key,
                'ok': True,
                'original_kb': round(orig_size / 1024),
                'new_kb': round(new_size / 1024),
                'saved_kb': round(saved / 1024),
                'saved_pct': round((saved / orig_size) * 100),
                'url': _cdn_url(key),
            })

        except Exception as e:
            results.append({'key': key, 'error': str(e)})

    optimized = [r for r in results if r.get('ok')]
    skipped = [r for r in results if r.get('skipped')]
    errors = [r for r in results if r.get('error')]

    return {
        'processed': len(results),
        'optimized_count': len(optimized),
        'skipped_count': len(skipped),
        'errors_count': len(errors),
        'total_saved_kb': round(total_saved / 1024),
        'results': results,
        'summary': (
            f"Обработано {len(results)} файлов: "
            f"сжато {len(optimized)}, "
            f"пропущено {len(skipped)}, "
            f"ошибок {len(errors)}. "
            f"Сэкономлено {round(total_saved / 1024)} KB."
        ),
    }


def _action_delete_unused(cur, s3, keys: list) -> dict:
    """Удаляет файлы из S3, предварительно проверяя что они не используются в БД."""
    # Финальная проверка — не удаляем то, что сейчас используется
    used_keys = _get_used_keys(cur)
    safe_to_delete = [k for k in keys[:200] if k not in used_keys]
    protected = [k for k in keys if k in used_keys]

    deleted, errors = [], []
    for key in safe_to_delete:
        try:
            s3.delete_object(Bucket=BUCKET, Key=key)
            deleted.append(key)
        except Exception as e:
            errors.append({'key': key, 'error': str(e)})

    return {
        'deleted_count': len(deleted),
        'deleted': deleted,
        'protected_count': len(protected),
        'protected': protected,
        'errors': errors,
        'summary': (
            f"Удалено {len(deleted)} файлов. "
            + (f"Защищено {len(protected)} (используются в БД). " if protected else "")
            + (f"Ошибок: {len(errors)}." if errors else "")
        ),
    }


# ── Handler ────────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """Оптимизатор изображений: сканирование, сжатие, удаление неиспользуемых фото в S3."""
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
                f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
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
                return _ok(_action_scan(cur, s3))

            elif action == 'optimize':
                keys = body.get('keys') or []
                if not keys:
                    return _err(400, 'Нужен список keys для сжатия')
                return _ok(_action_optimize(s3, keys))

            elif action == 'delete':
                if user['role'] not in ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager'):
                    return _err(403, 'Недостаточно прав для удаления')
                keys = body.get('keys') or []
                if not keys:
                    return _err(400, 'Нужен список keys для удаления')
                return _ok(_action_delete_unused(cur, s3, keys))

            else:
                return _err(400, f'Неизвестное действие: {action}. Доступно: scan, optimize, delete')

    finally:
        conn.close()
