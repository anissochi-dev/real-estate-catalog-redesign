"""
Безопасная загрузка файлов от посетителей (фото/PDF).
Защита: magic bytes, размер, сканирование опасного контента, rate limit по IP.
Args: POST body {file: base64string}
Returns: {success, url, mime, size}
"""

import base64
import hashlib
import json
import os
import time

import boto3

ALLOWED = {
    bytes([0xFF, 0xD8, 0xFF]): ('image/jpeg', '.jpg'),
    bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]): ('image/png', '.png'),
    b'GIF87a': ('image/gif', '.gif'),
    b'GIF89a': ('image/gif', '.gif'),
    b'RIFF': ('image/webp', '.webp'),
    b'%PDF': ('application/pdf', '.pdf'),
}

MAX_SIZE = 20 * 1024 * 1024
DANGEROUS = [b'<script', b'<?php', b'javascript:', b'eval(', b'exec(', b'system(']


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _detect(data):
    for magic, info in ALLOWED.items():
        if data[:len(magic)] == magic:
            if magic == b'RIFF' and data[8:12] != b'WEBP':
                return None
            return info
    return None


def _safe(data, mime):
    lower = data[:4096].lower()
    for pat in DANGEROUS:
        if pat in lower:
            return False, 'Файл содержит запрещённый код'
    if mime == 'image/png':
        pos = 8
        while pos + 12 < min(len(data), 32768):
            try:
                ln = int.from_bytes(data[pos:pos+4], 'big')
                ct = data[pos+4:pos+8]
                if ct in (b'tEXt', b'iTXt', b'zTXt'):
                    chunk = data[pos+8:pos+8+min(ln, 512)].lower()
                    if b'<script' in chunk or b'javascript' in chunk:
                        return False, 'PNG содержит подозрительные метаданные'
                pos += 12 + ln
            except Exception:
                break
    return True, ''


def _check_rate(s3, ip, limit=10):
    key = f"ratelimit/{hashlib.md5(ip.encode()).hexdigest()}_{int(time.time()) // 3600}.txt"
    try:
        obj = s3.get_object(Bucket='files', Key=key)
        count = int(obj['Body'].read().decode())
    except Exception:
        count = 0
    if count >= limit:
        return False
    s3.put_object(Bucket='files', Key=key, Body=str(count + 1).encode(), ContentType='text/plain')
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

    ip = ((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp') or 'unknown'

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

    try:
        if ',' in file_b64 and file_b64.startswith('data:'):
            file_b64 = file_b64.split(',', 1)[1]
        file_data = base64.b64decode(file_b64)
    except Exception:
        return _err(400, 'Не удалось декодировать файл')

    if len(file_data) > MAX_SIZE:
        return _err(413, f'Файл слишком большой (макс. {MAX_SIZE // 1024 // 1024} МБ)')

    if len(file_data) < 16:
        return _err(400, 'Файл слишком маленький или повреждён')

    detected = _detect(file_data)
    if not detected:
        return _err(415, 'Тип файла не поддерживается. Разрешены: JPEG, PNG, GIF, WebP, PDF')
    mime, ext = detected

    ok, reason = _safe(file_data, mime)
    if not ok:
        return _err(400, f'Файл отклонён: {reason}')

    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )

    if not _check_rate(s3, ip):
        return _err(429, 'Превышен лимит загрузок (10 файлов в час). Попробуйте позже.')

    file_hash = hashlib.sha256(file_data).hexdigest()[:16]
    filename = f'public/{int(time.time())}_{file_hash}{ext}'

    s3.put_object(Bucket='files', Key=filename, Body=file_data, ContentType=mime)

    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{filename}"

    return _ok({'success': True, 'url': cdn_url, 'mime': mime, 'size': len(file_data)})
