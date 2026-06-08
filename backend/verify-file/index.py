"""
Отдаёт файлы верификации доменов (Яндекс, Google, Mail.ru, Bing и др.).
Вызывается из _redirects: все пути /yandex_*, /google*, /mailru-domain* и т.д.
передают имя файла через ?filename=...
Args: GET ?filename=mailru-domain6dS7udsVWBpJx77O
Returns: text/plain — содержимое файла из settings.verification_files
"""

import json
import os

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}

    # Имя файла из ?filename= (приоритет) или из пути запроса
    filename = (params.get('filename') or '').strip()
    if not filename:
        # Пробуем все варианты пути которые может передать платформа
        raw = (
            event.get('path') or
            event.get('rawPath') or
            event.get('requestContext', {}).get('path') or
            ''
        ).strip('/')
        # Берём последний сегмент: /f18a8295-.../mailru-domainXXX → mailru-domainXXX
        if raw:
            filename = raw.split('/')[-1]
    print(f'[verify-file] filename={filename!r}, path={event.get("path")!r}, rawPath={event.get("rawPath")!r}')

    if not filename:
        return {'statusCode': 400, 'headers': CORS, 'body': 'filename required'}

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    f"SELECT verification_files FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
                )
                row = cur.fetchone() or {}
    except Exception as e:
        print(f'[verify-file] DB error: {e}')
        return {'statusCode': 500, 'headers': CORS, 'body': 'DB error'}

    files = row.get('verification_files') or []
    if isinstance(files, str):
        try:
            files = json.loads(files)
        except Exception:
            files = []

    for vf in files:
        if vf.get('filename') == filename:
            content = vf.get('content', '')
            # Определяем Content-Type по расширению
            ct = 'text/plain; charset=utf-8'
            if filename.endswith('.xml'):
                ct = 'application/xml; charset=utf-8'
            elif filename.endswith('.html'):
                ct = 'text/html; charset=utf-8'
            return {
                'statusCode': 200,
                'headers': {**CORS, 'Content-Type': ct},
                'body': content,
            }

    print(f'[verify-file] not found: {filename}, files: {[f.get("filename") for f in files]}')
    return {'statusCode': 404, 'headers': CORS, 'body': f'Verification file not found: {filename}'}