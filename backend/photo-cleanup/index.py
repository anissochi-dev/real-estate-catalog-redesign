"""
Очистка хранилища: файлы для печати и ничейные фото/логотипы/документы.

Безопасная логика (storage_gc.py): файл считается используемым, если он упоминается
где-либо в базе. Ничейный файл сначала 7 дней лежит в карантине, и только потом удаляется.

GET                        → последние 5 прогонов
GET ?action=summary        → сводка для админки (только администратор)
GET ?action=dry_run        → пересчёт учёта без удаления (только администратор)
GET ?action=run            → пересчёт + удаление отлежавших карантин (только администратор)
GET ?action=print_cleanup  → ночная задача: файлы для печати + пересчёт карантина (ничейные НЕ удаляет)
GET ?action=pending        → сколько файлов ждут подтверждения удаления + нужно ли напомнить (администратор)
GET ?action=confirm        → удалить очередную пачку отлежавших карантин (администратор)
GET ?action=snooze         → отложить напоминание на месяц (администратор)
GET ?action=keep&key=...   → «Сохранить»: файл никогда не попадёт под очистку (администратор)
"""
import json
import os
import psycopg2
import boto3
from storage_gc import scan, delete_ready, save_log, QUARANTINE_DAYS

SCHEMA = 't_p71821556_real_estate_catalog_'
BUCKET = 'files'

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


def _cleanup_print_files(conn, limit: int = 200) -> dict:
    """Удаляет из S3 файлы для печати с истёкшим сроком (7 дней) и отмечает их removed_at."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT id, s3_key, preview_key, size_bytes FROM {SCHEMA}.print_files "
            f"WHERE removed_at IS NULL AND expires_at < NOW() ORDER BY expires_at LIMIT {int(limit)}"
        )
        rows = cur.fetchall()
    if not rows:
        return {'removed': 0, 'freed_mb': 0}
    s3_client = _s3()
    done_ids, freed, failed = [], 0, 0
    for rid, key, prev_key, size in rows:
        try:
            s3_client.delete_object(Bucket=BUCKET, Key=key)
            if prev_key:
                s3_client.delete_object(Bucket=BUCKET, Key=prev_key)
            done_ids.append(rid)
            freed += size or 0
        except Exception as e:
            failed += 1
            print(f'[print-cleanup] {key}: {e}')
    if done_ids:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {SCHEMA}.print_files SET removed_at = NOW() "
                f"WHERE id IN ({', '.join(str(i) for i in done_ids)})"
            )
        conn.commit()
    res = {'removed': len(done_ids), 'failed': failed, 'freed_mb': round(freed / 1048576, 1)}
    print(f'[print-cleanup] {res}')
    return res


def _is_admin(conn, token_raw: str) -> bool:
    if not token_raw:
        return False
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT u.role FROM {SCHEMA}.sessions s "
            f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
            f"WHERE s.token = '{token_raw}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
        )
        row = cur.fetchone()
    return bool(row and row[0] == 'admin')


def _gc(conn, delete: bool, status_label: str) -> dict:
    stats = scan(conn)
    ready = stats['ready_to_delete']
    result = {'removed': 0, 'removed_keys': [], 'failed': [], 'left': len(ready)}
    if delete and ready:
        result = delete_ready(conn, _s3(), ready)
    status = status_label if not delete else ('completed' if not result['failed'] else 'partial')
    save_log(conn, stats, result['removed'], result['removed_keys'], status,
             json.dumps(result['failed'][:20]) if result['failed'] else None)
    return {
        'total_tracked': stats['total_tracked'],
        'used': stats['used'],
        'fresh': stats['fresh'],
        'in_quarantine': stats['in_quarantine'],
        'newly_quarantined': stats['newly_quarantined'],
        'newly_attached': stats['newly_attached'],
        'ready_to_delete': len(ready),
        'sample_ready': [k for _, k in ready[:20]],
        'removed': result['removed'],
        'failed': len(result['failed']),
        'errors': result['failed'][:5],
        'left': result['left'],
    }


REMIND_DAYS = 30
SAMPLE_SIZE = 30


def _pending_info(conn) -> dict:
    """Файлы, отлежавшие карантин и ждущие подтверждения администратора."""
    ready_sql = (
        f"FROM {SCHEMA}.s3_photo_refs WHERE keep_forever = FALSE AND orphan_since IS NOT NULL "
        f"AND orphan_since < NOW() - INTERVAL '{QUARANTINE_DAYS} days' "
        f"AND split_part(s3_key, '/', 1) IN ('photos', 'logos', 'watermarks', 'documents')"
    )
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) {ready_sql}")
        count = cur.fetchone()[0]
        cur.execute(f"SELECT s3_key, cdn_url, orphan_since {ready_sql} ORDER BY orphan_since, id LIMIT {SAMPLE_SIZE}")
        sample = [{'key': r[0], 'url': r[1], 'orphan_since': r[2]} for r in cur.fetchall()]
        cur.execute(
            f"SELECT storage_cleanup_next_at, storage_cleanup_last_at, "
            f"storage_cleanup_next_at IS NULL OR storage_cleanup_next_at <= NOW() "
            f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
        )
        s = cur.fetchone() or (None, None, True)
    return {
        'ready': count,
        'sample': sample,
        'next_reminder_at': s[0],
        'last_cleanup_at': s[1],
        'notify': bool(count > 0 and s[2]),
    }


def _set_next_reminder(conn, cleaned: bool):
    with conn.cursor() as cur:
        extra = ", storage_cleanup_last_at = NOW()" if cleaned else ""
        cur.execute(
            f"UPDATE {SCHEMA}.settings SET storage_cleanup_next_at = NOW() + INTERVAL '{REMIND_DAYS} days'{extra} "
            f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
        )
    conn.commit()


def _confirm_actions(conn, action: str, params: dict) -> dict:
    if action == 'pending':
        return _ok(_pending_info(conn))

    if action == 'snooze':
        _set_next_reminder(conn, cleaned=False)
        return _ok({'ok': True, **_pending_info(conn)})

    if action == 'keep':
        key = (params.get('key') or '').strip()
        if not key or len(key) > 500:
            return _err(400, 'Не указан файл')
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {SCHEMA}.s3_photo_refs SET keep_forever = TRUE, is_orphan = FALSE, orphan_since = NULL "
                f"WHERE s3_key = %s",
                (key,)
            )
            updated = cur.rowcount
        conn.commit()
        if not updated:
            return _err(404, 'Файл не найден')
        return _ok({'ok': True, 'kept': key, **_pending_info(conn)})

    res = _gc(conn, delete=True, status_label='completed')
    if res['left'] == 0 and res['failed'] == 0:
        _set_next_reminder(conn, cleaned=True)
    return _ok({'mode': 'confirm', **res, 'done': res['left'] == 0})


def handler(event: dict, context) -> dict:
    """Очистка хранилища: просроченные файлы для печати и ничейные файлы после 7 дней карантина."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    if action == 'summary':
        from s3_audit import handler as summary_handler
        return summary_handler(event, context)
    token_raw = params.get('token', '') or (event.get('headers') or {}).get('x-authorization', '').replace('Bearer ', '').strip()
    token_raw = token_raw.replace("'", "''")[:200]

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        if action in ('dry_run', 'run'):
            if not token_raw:
                return _err(401, 'Требуется авторизация')
            if not _is_admin(conn, token_raw):
                return _err(403, 'Только для администратора')
            res = _gc(conn, delete=(action == 'run'), status_label='dry_run')
            return _ok({'mode': action, **res})

        if action in ('pending', 'confirm', 'snooze', 'keep'):
            if not token_raw:
                return _err(401, 'Требуется авторизация')
            if not _is_admin(conn, token_raw):
                return _err(403, 'Только для администратора')
            return _confirm_actions(conn, action, params)

        if action == 'print_cleanup':
            print_res = _cleanup_print_files(conn)
            gc_res = _gc(conn, delete=False, status_label='scan')
            print(f'[storage-gc] {json.dumps({k: v for k, v in gc_res.items() if k not in ("sample_ready", "errors")})}')
            return _ok({'mode': 'print_cleanup', 'print_cleanup': print_res, 'storage': gc_res})

        if action:
            return _err(400, 'Неизвестное действие')

        with conn.cursor() as cur:
            cur.execute(
                f"SELECT run_at, total_s3, used_s3, orphan_s3, removed_s3, quarantine_s3, "
                f"status, error_msg FROM {SCHEMA}.s3_orphans_log ORDER BY run_at DESC LIMIT 5"
            )
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        return _ok({'last_runs': rows})
    finally:
        conn.close()
