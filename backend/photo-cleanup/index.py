"""
Крон-функция: очистка сиротских фото в S3.
Запускается раз в сутки (например в 03:00 МСК).
Алгоритм (без листинга S3 — провайдер не поддерживает):
  1. Читает из s3_photo_refs записи где is_orphan=TRUE и uploaded_at < NOW() - 24ч
  2. Для каждого сиротского ключа вызывает s3.delete_object
  3. Обновляет s3_photo_refs — помечает удалённые
  4. Пишет результат в s3_orphans_log

GET               → последние 5 прогонов из s3_orphans_log
GET ?action=dry_run → показывает орфанов без удаления (требует admin-токен)
GET ?action=run     → реальное удаление (требует admin-токен)
Крон-вызов без токена: action=run разрешён без авторизации (доверенный вызов по расписанию).
"""
import json
import os
import re
import psycopg2
import boto3
from datetime import datetime, timezone, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'
MIN_AGE_HOURS = 24

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
}


def _ok(body: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str, ensure_ascii=False)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg})}


def _s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def _save_log(conn, total_s3, used_s3, orphan_s3, removed_s3,
              orphan_mb, removed_mb, orphan_keys, removed_keys, status='completed', error=None):
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {SCHEMA}.s3_orphans_log "
            "(total_s3, used_s3, orphan_s3, removed_s3, "
            "orphan_size_mb, removed_size_mb, "
            "orphan_keys, removed_keys, status, error_msg) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                total_s3, used_s3, orphan_s3, removed_s3,
                round(orphan_mb, 3), round(removed_mb, 3),
                json.dumps(orphan_keys[:500]),
                json.dumps(removed_keys[:500]),
                status, error,
            )
        )
    conn.commit()


def handler(event: dict, context) -> dict:
    """Очистка сиротских фото через s3_photo_refs. Работает без листинга S3."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    token_raw = params.get('token', '') or (event.get('headers') or {}).get('x-authorization', '').replace('Bearer ', '').strip()

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)

    # dry_run требует токен; run разрешён и без токена (крон-вызов)
    if action == 'dry_run':
        if not token_raw:
            conn.close()
            return _err(401, 'Требуется авторизация')
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT u.role FROM {SCHEMA}.sessions s "
                f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
                f"WHERE s.token = '{token_raw}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
            )
            row = cur.fetchone()
        if not row or row[0] != 'admin':
            conn.close()
            return _err(403, 'Только для администратора')

    # Без action — возвращаем последние прогоны
    if not action:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT run_at, total_s3, used_s3, orphan_s3, removed_s3, "
                f"orphan_size_mb, removed_size_mb, status, error_msg "
                f"FROM {SCHEMA}.s3_orphans_log ORDER BY run_at DESC LIMIT 5"
            )
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        conn.close()
        return _ok({'last_runs': rows})

    # Получаем орфанов из БД (старше MIN_AGE_HOURS)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MIN_AGE_HOURS)
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, s3_key, cdn_url FROM {SCHEMA}.s3_photo_refs "
            f"WHERE is_orphan = TRUE AND uploaded_at < %s",
            (cutoff,)
        )
        orphan_rows = cur.fetchall()

        # Общая статистика из таблицы
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.s3_photo_refs")
        total_s3 = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.s3_photo_refs WHERE is_orphan = FALSE")
        used_s3 = cur.fetchone()[0]

    orphan_ids = [r[0] for r in orphan_rows]
    orphan_keys = [r[1] for r in orphan_rows]
    orphan_mb = len(orphan_keys) * 0.15  # примерная оценка ~150KB на фото

    if action == 'dry_run':
        _save_log(conn, total_s3, used_s3, len(orphan_keys), 0,
                  orphan_mb, 0, orphan_keys, [], status='dry_run')
        conn.close()
        return _ok({
            'mode': 'dry_run',
            'total_tracked': total_s3,
            'used': used_s3,
            'orphan_count': len(orphan_keys),
            'orphan_age_threshold_hours': MIN_AGE_HOURS,
            'sample_orphans': orphan_keys[:20],
        })

    # action == 'run' — удаляем из S3 и помечаем в БД
    if not orphan_keys:
        _save_log(conn, total_s3, used_s3, 0, 0, 0, 0, [], [], status='completed')
        conn.close()
        return _ok({'mode': 'run', 'removed': 0, 'message': 'Нет сиротских фото старше 24 часов'})

    s3_client = _s3()
    removed_keys = []
    failed_keys = []

    for s3_key in orphan_keys:
        try:
            s3_client.delete_object(Bucket=BUCKET, Key=s3_key)
            removed_keys.append(s3_key)
        except Exception as e:
            failed_keys.append({'key': s3_key, 'error': str(e)})

    # Помечаем удалённые в БД — ставим is_orphan=FALSE чтобы не пытаться снова
    # (физически они уже удалены из S3)
    if removed_keys and orphan_ids:
        removed_set = set(removed_keys)
        ids_to_clear = [orphan_ids[i] for i, k in enumerate(orphan_keys) if k in removed_set]
        if ids_to_clear:
            ids_sql = ', '.join(str(i) for i in ids_to_clear)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {SCHEMA}.s3_photo_refs SET is_orphan = FALSE, listing_id = NULL "
                    f"WHERE id IN ({ids_sql})"
                )
            conn.commit()

    removed_mb = len(removed_keys) * 0.15
    status = 'completed' if not failed_keys else 'partial'
    _save_log(conn, total_s3, used_s3, len(orphan_keys), len(removed_keys),
              orphan_mb, removed_mb, orphan_keys, removed_keys,
              status=status,
              error=json.dumps(failed_keys[:20]) if failed_keys else None)
    conn.close()

    return _ok({
        'mode': 'run',
        'total_tracked': total_s3,
        'orphan_count': len(orphan_keys),
        'removed': len(removed_keys),
        'failed': len(failed_keys),
        'errors': failed_keys[:5],
    })
