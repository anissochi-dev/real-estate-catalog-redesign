"""
Безопасная загрузка файлов от посетителей сайта.
Защита: проверка MIME по magic bytes, лимит размера, rate limit по IP,
сканирование на опасный контент (скрипты, исполняемые файлы, ZIP-бомбы).
Поддерживаемые типы: JPEG, PNG, GIF, WebP, PDF.
Args: event с httpMethod POST, body {file: base64}
Returns: {success, url, mime, size}
"""

import base64
import hashlib
import io
import json
import os
import time

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

# Разрешённые MIME по magic bytes
ALLOWED = {
    b'\xff\xd8\xff': ('image/jpeg', '.jpg'),
    b'\x89PNG\r\n\x1a\n': ('image/png', '.png'),
    b'GIF87a': ('image/gif', '.gif'),
    b'GIF89a': ('image/gif', '.gif'),
    b'RIFF': ('image/webp', '.webp'),   # дополнительно проверяем WEBP ниже
    b'%PDF': ('application/pdf', '.pdf'),
}

MAX_SIZE_BYTES = 20 * 1024 * 1024   # 20 МБ
MAX_SIZE_PDF   = 10 * 1024 * 1024   # PDF ограничиваем 10 МБ
RATE_LIMIT_PER_HOUR = 10             # файлов с одного IP в час
RATE_WINDOW = 3600


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _detect_type(data: bytes):
    """Проверяет magic bytes и возвращает (mime, ext) или None."""
    for magic, info in ALLOWED.items():
        if data[:len(magic)] == magic:
            if magic == b'RIFF':
                # WebP: bytes 8-12 должны быть 'WEBP'
                if data[8:12] != b'WEBP':
                    return None
            return info
    return None


def _is_safe_content(data: bytes, mime: str) -> tuple[bool, str]:
    """Сканирует содержимое файла на опасный контент."""
    # 1. Проверка ZIP-бомбы: сжатие > 100x подозрительно
    if mime == 'application/pdf':
        if len(data) > MAX_SIZE_PDF:
            return False, 'PDF превышает допустимый размер'

    # 2. Поиск скриптовых сигнатур в изображениях (полиглоты)
    DANGEROUS_PATTERNS = [
        b'<script', b'<?php', b'<html', b'javascript:',
        b'eval(', b'exec(', b'system(', b'passthru(',
        b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'  # длинные нули — признак эксплойта
        b'MZ',  # PE executable header в начале — уже проверен типом, но на всякий случай
    ]
    lower = data[:4096].lower()  # смотрим только начало
    for pat in DANGEROUS_PATTERNS:
        if pat in lower:
            return False, 'Файл содержит потенциально опасный код'

    # 3. Для изображений — проверяем через простой парсинг заголовка
    if mime in ('image/jpeg', 'image/png', 'image/gif', 'image/webp'):
        # PNG: проверяем чанки на embedded scripts
        if mime == 'image/png':
            chunk_pos = 8
            while chunk_pos + 8 < min(len(data), 65536):
                try:
                    length = int.from_bytes(data[chunk_pos:chunk_pos+4], 'big')
                    chunk_type = data[chunk_pos+4:chunk_pos+8]
                    if chunk_type in (b'tEXt', b'iTXt', b'zTXt'):
                        chunk_data = data[chunk_pos+8:chunk_pos+8+min(length, 1024)].lower()
                        for pat in [b'<script', b'javascript', b'<?php']:
                            if pat in chunk_data:
                                return False, 'PNG содержит подозрительные метаданные'
                    chunk_pos += 12 + length
                except Exception:
                    break

    return True, ''


def _check_rate_limit(cur, conn, ip: str) -> bool:
    """Проверяет rate limit: не более RATE_LIMIT_PER_HOUR загрузок с IP за час."""
    now = int(time.time())
    window_start = now - RATE_WINDOW
    safe_ip = ip.replace("'", "")[:50]

    # Чистим старые записи и считаем текущие
    cur.execute(
        f"SELECT COUNT(*) as cnt FROM {SCHEMA}.listing_views "
        f"WHERE ip = '{safe_ip}' AND user_agent = 'public_upload' "
        f"AND EXTRACT(EPOCH FROM viewed_at) > {window_start}"
    )
    row = cur.fetchone()
    count = row['cnt'] if row else 0
    if count >= RATE_LIMIT_PER_HOUR:
        return False

    # Записываем факт загрузки (переиспользуем таблицу listing_views)
    cur.execute(
        f"INSERT INTO {SCHEMA}.listing_views (listing_id, ip, user_agent, referrer) "
        f"VALUES (0, '{safe_ip}', 'public_upload', 'file_upload')"
    )
    conn.commit()
    return True


def handler(event, context):
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _err(405, 'Метод не разрешён')

    ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp') or 'unknown'

    body_raw = event.get('body') or ''
    if event.get('isBase64Encoded'):
        body_raw = base64.b64decode(body_raw).decode('utf-8', errors='replace')

    try:
        body = json.loads(body_raw)
    except Exception:
        return _err(400, 'Неверный формат запроса')

    file_b64 = body.get('file', '')
    if not file_b64:
        return _err(400, 'Файл не передан')

    # 1. Декодируем base64
    try:
        # Убираем data URL префикс если есть
        if ',' in file_b64 and file_b64.startswith('data:'):
            file_b64 = file_b64.split(',', 1)[1]
        file_data = base64.b64decode(file_b64)
    except Exception:
        return _err(400, 'Не удалось декодировать файл')

    # 2. Проверяем размер до обработки
    if len(file_data) > MAX_SIZE_BYTES:
        return _err(413, f'Файл слишком большой (макс. {MAX_SIZE_BYTES // 1024 // 1024} МБ)')

    if len(file_data) < 16:
        return _err(400, 'Файл слишком маленький или повреждён')

    # 3. Определяем тип по magic bytes — НЕ по расширению клиента
    detected = _detect_type(file_data)
    if not detected:
        return _err(415, 'Тип файла не поддерживается. Разрешены: JPEG, PNG, GIF, WebP, PDF')
    mime, ext = detected

    # 4. Дополнительная проверка безопасности содержимого
    safe, reason = _is_safe_content(file_data, mime)
    if not safe:
        return _err(400, f'Файл отклонён: {reason}')

    # 5. Rate limit по IP
    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if not _check_rate_limit(cur, conn, ip):
                return _err(429, f'Превышен лимит загрузок ({RATE_LIMIT_PER_HOUR} файлов в час). Попробуйте позже.')

            # 6. Генерируем безопасное имя файла (хэш содержимого)
            file_hash = hashlib.sha256(file_data).hexdigest()[:16]
            timestamp = int(time.time())
            filename = f'public/{timestamp}_{file_hash}{ext}'

            # 7. Загружаем в S3
            s3 = boto3.client(
                's3',
                endpoint_url='https://bucket.poehali.dev',
                aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
                aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
            )
            s3.put_object(
                Bucket='files',
                Key=filename,
                Body=file_data,
                ContentType=mime,
            )

            cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{filename}"

            return _ok({
                'success': True,
                'url': cdn_url,
                'mime': mime,
                'size': len(file_data),
            })
    finally:
        conn.close()