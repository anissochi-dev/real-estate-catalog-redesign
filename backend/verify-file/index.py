"""
Управление файлами верификации доменов (Яндекс, Google, Mail.ru, Bing и др.).

GET  ?filename=XXX              — отдать содержимое файла из БД
POST {action:'upload', filename, content, comment?}
                                — загрузить файл в S3, сохранить в БД, вернуть cdn_url
POST {action:'delete', filename} — удалить файл из S3 и БД
GET  ?action=list               — список всех файлов (cdn_url, filename, comment)
"""

import json
import os
import boto3

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')
S3_ENDPOINT = 'https://bucket.poehali.dev'
S3_BUCKET = 'files'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False),
    }


def _err(code, msg):
    return _ok({'error': msg}, code)


def _db():
    import psycopg2
    from psycopg2.extras import RealDictCursor
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    return conn, conn.cursor(cursor_factory=RealDictCursor)


def _s3():
    return boto3.client(
        's3',
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _cdn_url(key: str) -> str:
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def _load_files(cur) -> list:
    cur.execute(f"SELECT verification_files FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    row = cur.fetchone() or {}
    files = row.get('verification_files') or []
    if isinstance(files, str):
        try:
            files = json.loads(files)
        except Exception:
            files = []
    return list(files) if isinstance(files, list) else []


def _save_files(cur, conn, files: list):
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET verification_files = %s::jsonb WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)",
        (json.dumps(files, ensure_ascii=False),)
    )
    conn.commit()


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    # ── GET ?action=list ─────────────────────────────────────────────────────
    if method == 'GET' and action == 'list':
        try:
            conn, cur = _db()
            files = _load_files(cur)
            cur.close(); conn.close()
            return _ok({'files': files})
        except Exception as e:
            return _err(500, str(e)[:200])

    # ── GET ?filename=XXX — отдать содержимое файла ───────────────────────────
    if method == 'GET':
        filename = (params.get('filename') or '').strip()
        if not filename:
            raw = (event.get('path') or event.get('rawPath') or '').strip('/')
            filename = raw.split('/')[-1] if raw else ''

        if not filename:
            return {'statusCode': 400, 'headers': CORS, 'body': 'filename required'}

        # Если есть cdn_url — редиректим на S3 напрямую
        try:
            conn, cur = _db()
            files = _load_files(cur)
            cur.close(); conn.close()
        except Exception as e:
            return {'statusCode': 500, 'headers': CORS, 'body': f'DB error: {e}'}

        for vf in files:
            if vf.get('filename') == filename:
                # Если файл в S3 — 302 на CDN (браузер/бот получит файл напрямую)
                cdn_url = vf.get('cdn_url', '')
                if cdn_url:
                    return {'statusCode': 302, 'headers': {**CORS, 'Location': cdn_url}, 'body': ''}
                # Иначе отдаём содержимое из БД
                content = vf.get('content', '')
                ct = 'text/plain; charset=utf-8'
                if filename.endswith('.xml'):
                    ct = 'application/xml; charset=utf-8'
                elif filename.endswith('.html'):
                    ct = 'text/html; charset=utf-8'
                return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': ct}, 'body': content}

        return {'statusCode': 404, 'headers': CORS, 'body': f'Not found: {filename}'}

    # ── POST ──────────────────────────────────────────────────────────────────
    if method == 'POST':
        try:
            body = json.loads(event.get('body') or '{}')
        except Exception:
            return _err(400, 'Invalid JSON')

        post_action = body.get('action', '')

        # upload — загружаем файл в S3 и сохраняем в БД
        if post_action == 'upload':
            filename = (body.get('filename') or '').strip().lstrip('/')
            content = (body.get('content') or '').strip()
            comment = (body.get('comment') or '').strip()

            if not filename or not content:
                return _err(400, 'filename и content обязательны')

            # Content-Type по расширению
            ct_map = {'.html': 'text/html', '.xml': 'application/xml', '.txt': 'text/plain'}
            ext = '.' + filename.rsplit('.', 1)[-1] if '.' in filename else ''
            content_type = ct_map.get(ext, 'text/plain') + '; charset=utf-8'

            # Загружаем в S3
            try:
                s3 = _s3()
                key = f'verify/{filename}'
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=key,
                    Body=content.encode('utf-8'),
                    ContentType=content_type,
                )
                cdn_url = _cdn_url(key)
                print(f'[verify-file] uploaded: {cdn_url}')
            except Exception as e:
                print(f'[verify-file] S3 error: {e}')
                return _err(502, f'Ошибка загрузки в S3: {str(e)[:200]}')

            # Сохраняем в БД (обновляем или добавляем)
            try:
                conn, cur = _db()
                files = _load_files(cur)
                existing = next((i for i, f in enumerate(files) if f.get('filename') == filename), None)
                entry = {'filename': filename, 'content': content, 'comment': comment, 'cdn_url': cdn_url}
                if existing is not None:
                    files[existing] = entry
                else:
                    files.append(entry)
                _save_files(cur, conn, files)
                cur.close(); conn.close()
            except Exception as e:
                return _err(500, f'Ошибка БД: {str(e)[:200]}')

            return _ok({'ok': True, 'cdn_url': cdn_url, 'filename': filename})

        # delete — удаляем файл
        if post_action == 'delete':
            filename = (body.get('filename') or '').strip()
            if not filename:
                return _err(400, 'filename обязателен')
            try:
                conn, cur = _db()
                files = _load_files(cur)
                # Пробуем удалить из S3
                cdn_to_delete = next((f.get('cdn_url') for f in files if f.get('filename') == filename), None)
                if cdn_to_delete:
                    try:
                        s3 = _s3()
                        s3.delete_object(Bucket=S3_BUCKET, Key=f'verify/{filename}')
                    except Exception:
                        pass
                files = [f for f in files if f.get('filename') != filename]
                _save_files(cur, conn, files)
                cur.close(); conn.close()
                return _ok({'ok': True})
            except Exception as e:
                return _err(500, str(e)[:200])

        return _err(400, f'Неизвестный action: {post_action}')

    return _err(405, 'Method not allowed')
