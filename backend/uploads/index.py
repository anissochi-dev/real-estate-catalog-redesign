"""
Business: Загрузка фото (логотип, фото объекта, водяной знак) в S3 через base64. Возвращает CDN URL.
Args: event с httpMethod POST, body {file_base64, filename, folder}; headers X-Auth-Token; context
Returns: HTTP с {url} или ошибкой авторизации
"""

import base64
import json
import os
import uuid

import boto3
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CONTENT_TYPES = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(c, m):
    return _ok({'error': m}, c)


def _safe(s, length=100):
    return (s or '').replace("'", "''")[:length]


def _check_auth(token):
    if not token:
        return None
    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            t = _safe(token, 100)
            cur.execute(
                f"SELECT u.id, u.role FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE"
            )
            return cur.fetchone()
    finally:
        conn.close()


def handler(event, context):
    method = event.get('httpMethod', 'POST')

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    if method != 'POST':
        return _err(405, 'Method not allowed')

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    user = _check_auth(token)
    if not user:
        return _err(401, 'Требуется авторизация')
    if user['role'] not in ('admin', 'editor', 'manager'):
        return _err(403, 'Только для сотрудников')

    body = json.loads(event.get('body') or '{}')
    b64 = body.get('file_base64', '')
    filename = body.get('filename', 'file.jpg')
    folder = body.get('folder', 'photos')
    if folder not in ('photos', 'logo', 'watermark'):
        folder = 'photos'

    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    try:
        data = base64.b64decode(b64)
    except Exception:
        return _err(400, 'Некорректный base64')

    if len(data) > 10 * 1024 * 1024:
        return _err(413, 'Файл больше 10 МБ')

    ext = (filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg').lower()
    if ext not in CONTENT_TYPES:
        ext = 'jpg'
    ct = CONTENT_TYPES[ext]

    key = f"{folder}/{uuid.uuid4().hex}.{ext}"

    aws_key = os.environ['AWS_ACCESS_KEY_ID']
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=aws_key,
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=data, ContentType=ct)

    url = f"https://cdn.poehali.dev/projects/{aws_key}/bucket/{key}"
    return _ok({'url': url})
