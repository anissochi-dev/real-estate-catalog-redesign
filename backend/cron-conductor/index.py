"""
Дирижёр фоновых задач сайта: на каждый «тик» от браузера посетителя выбирает
ОДНУ задачу, которой пора выполняться (по приоритету и интервалу), и выдаёт её.
Между задачами — общая пауза, чтобы они не накладывались и не перегружали БД.
GET ?action=tick   — получить задачу для запуска (или пусто)
GET ?action=status — состояние всех задач (для ВБ и админки)
"""
import json
import os
from datetime import datetime, timezone, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
MSK = timezone(timedelta(hours=3))

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

JOB_TARGETS = {
    'platform_sync': {'url': 'https://functions.poehali.dev/fd00362c-a377-4d94-816c-c5a4abf087cd?action=cron', 'method': 'GET', 'long': True},
    'xml_feeds': {'url': 'https://functions.poehali.dev/7c55dfb4-7ede-46fb-be64-dea578da5eb7?action=cron', 'method': 'GET', 'long': True},
    'news': {'url': 'https://functions.poehali.dev/984cad3a-0783-4408-a614-52ed36f8c77f?action=ping_cron', 'method': 'POST', 'body': {}, 'long': True},
    'auto_seo': {'url': 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d', 'method': 'POST', 'body': {'action': 'ping'}},
    'ai_retrain': {'url': 'https://functions.poehali.dev/e2f1d357-fb83-4fbb-8d8b-6fb063357afc?action=cron', 'method': 'GET'},
    'listing_faq': {'url': 'https://functions.poehali.dev/282b9c5f-29fa-41ea-bc42-0793bdf8950d', 'method': 'POST', 'body': {'action': 'batch', 'limit': 5}},
    'vb_digest': {'url': 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef', 'method': 'POST', 'body': {'action': 'vb_digest'}, 'long': True},
}


def _json(body, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _is_due(job, now):
    last = job.get('last_dispatched_at')
    if job.get('run_hour') is not None:
        now_msk = now.astimezone(MSK)
        if now_msk.hour < int(job['run_hour']):
            return False
        return not last or last.astimezone(MSK).date() < now_msk.date()
    return not last or (now - last).total_seconds() >= int(job['interval_sec'])


def _tick(cur, conn, has_auth, source):
    now = datetime.now(timezone.utc)
    cur.execute(f"SELECT * FROM {SCHEMA}.cron_jobs WHERE enabled = TRUE ORDER BY priority")
    jobs = [dict(r) for r in cur.fetchall()]
    glob = next((j for j in jobs if j['name'] == '__global'), None)
    gap = int(glob['interval_sec']) if glob else 60

    # Общая пауза: атомарно «занимаем» окно, чтобы два посетителя не запустили задачи одновременно
    cur.execute(
        f"UPDATE {SCHEMA}.cron_jobs SET last_dispatched_at = NOW(), updated_at = NOW() "
        f"WHERE name = '__global' AND (last_dispatched_at IS NULL OR last_dispatched_at < NOW() - INTERVAL '{gap} seconds') "
        f"RETURNING name"
    )
    if not cur.fetchone():
        conn.rollback()
        return None

    for job in jobs:
        name = job['name']
        if name == '__global' or name not in JOB_TARGETS:
            continue
        if job['needs_auth'] and not has_auth:
            continue
        if not _is_due(job, now):
            continue
        cur.execute(
            f"UPDATE {SCHEMA}.cron_jobs SET last_dispatched_at = NOW(), dispatch_count = dispatch_count + 1, "
            f"updated_at = NOW() WHERE name = %s RETURNING name", (name,)
        )
        cur.execute(f"INSERT INTO {SCHEMA}.cron_runs (job, source) VALUES (%s, %s)", (name, source))
        cur.execute(f"DELETE FROM {SCHEMA}.cron_runs WHERE dispatched_at < NOW() - INTERVAL '7 days'")
        conn.commit()
        t = JOB_TARGETS[name]
        return {'job': name, 'title': job['title'], 'url': t['url'], 'method': t['method'],
                'body': t.get('body'), 'needs_auth': job['needs_auth'], 'long': bool(t.get('long'))}

    # Ничего не нужно — освобождаем общее окно, чтобы следующая задача не ждала зря
    conn.rollback()
    return None


def _status(cur):
    now = datetime.now(timezone.utc)
    cur.execute(f"SELECT * FROM {SCHEMA}.cron_jobs WHERE name <> '__global' ORDER BY priority")
    jobs = []
    for r in cur.fetchall():
        j = dict(r)
        last = j.get('last_dispatched_at')
        j['minutes_ago'] = round((now - last).total_seconds() / 60, 1) if last else None
        j['due'] = _is_due(j, now)
        cur.execute(
            f"SELECT COUNT(*) AS c FROM {SCHEMA}.cron_runs WHERE job = %s AND dispatched_at > NOW() - INTERVAL '24 hours'",
            (j['name'],)
        )
        j['runs_24h'] = cur.fetchone()['c']
        jobs.append(j)
    return {'ok': True, 'jobs': jobs, 'checked_at': now.isoformat()}


def handler(event: dict, context) -> dict:
    """Дирижёр фоновых задач: выдаёт одну задачу за тик, не давая им накладываться."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}
    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'tick')
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if action == 'status':
                return _json(_status(cur))
            if action == 'tick':
                task = _tick(cur, conn, params.get('auth') == '1', params.get('source') or 'visitor')
                return _json({'ok': True, 'task': task})
            return _json({'error': 'Неизвестное действие'}, 400)
    except psycopg2.Error as e:
        try:
            conn.rollback()
        except Exception:
            pass
        if 'rate limit' in str(e).lower():
            return _json({'ok': True, 'task': None, 'busy': True})
        raise
    finally:
        conn.close()
