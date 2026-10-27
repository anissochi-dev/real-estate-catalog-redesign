"""
Аудит фотографий S3: читает результаты последнего прогона photo-cleanup из s3_orphans_log.
Также считает актуальное количество уникальных CDN-фото из БД.
GET  → сводный отчёт (последний прогон + текущая статистика БД)
Доступно только для admin.
"""
import json
import os
import psycopg2

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
}


def _ok(body: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str, ensure_ascii=False)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg})}


def handler(event: dict, context) -> dict:
    """Возвращает сводку по фото: последний прогон очистки + актуальная статистика из БД."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    token_raw = params.get('token', '') or (event.get('headers') or {}).get('x-authorization', '').replace('Bearer ', '').strip()
    token_raw = token_raw.replace("'", "''")[:200]
    if not token_raw:
        return _err(401, 'Требуется авторизация')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT u.role FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{token_raw}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
            )
            row = cur.fetchone()
        if not row or row[0] != 'admin':
            return _err(403, 'Только для администратора')

        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT
                    COUNT(*) AS total_tracked,
                    COUNT(*) FILTER (WHERE is_orphan = FALSE) AS attached,
                    COUNT(*) FILTER (WHERE orphan_since IS NOT NULL AND orphan_since >= NOW() - INTERVAL '7 days') AS in_quarantine,
                    COUNT(*) FILTER (WHERE orphan_since IS NOT NULL AND orphan_since < NOW() - INTERVAL '7 days') AS ready_to_delete,
                    COUNT(*) FILTER (WHERE is_orphan = TRUE AND orphan_since IS NULL) AS unchecked,
                    MIN(orphan_since + INTERVAL '7 days') FILTER (WHERE orphan_since IS NOT NULL) AS next_delete_at
                FROM {SCHEMA}.s3_photo_refs
            """)
            ref_cols = [d[0] for d in cur.description]
            photo_refs = dict(zip(ref_cols, cur.fetchone() or []))

            cur.execute(f"""
                SELECT s3_key, cdn_url, orphan_since
                FROM {SCHEMA}.s3_photo_refs
                WHERE orphan_since IS NOT NULL
                ORDER BY orphan_since LIMIT 5
            """)
            quarantine_sample = [
                {'s3_key': r[0], 'cdn_url': r[1], 'orphan_since': str(r[2])}
                for r in cur.fetchall()
            ]

            # История прогонов очистки
            cur.execute(f"""
                SELECT run_at, total_s3, used_s3, orphan_s3, removed_s3, quarantine_s3,
                       status, error_msg
                FROM {SCHEMA}.s3_orphans_log ORDER BY run_at DESC LIMIT 5
            """)
            hist_cols = [d[0] for d in cur.description]
            history = [dict(zip(hist_cols, r)) for r in cur.fetchall()]

    finally:
        conn.close()

    return _ok({
        'photo_refs': photo_refs,
        'quarantine_sample': quarantine_sample,
        'cleanup_history': history,
    })
