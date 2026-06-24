"""
Статистика просмотров и обращений по объектам недвижимости.
GET  ?listing_id=123          — сводка по объекту
GET  ?listing_id=123&history=1 — история событий
POST {listing_id, event_type, source, count, note} — записать событие вручную (только авторизованные)
POST {listing_id, event_type='view_site'}           — записать просмотр сайта (публичный)
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'
CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

SOURCE_LABELS = {
    'site': 'Наш сайт',
    'avito': 'Авито',
    'cian': 'ЦИАН',
    'yandex': 'Яндекс Недвижимость',
    'domclick': 'Домклик',
    'xml': 'XML-выгрузка',
    'other': 'Другое',
}

EVENT_LABELS = {
    'view_site': 'Просмотр на сайте',
    'view_avito': 'Просмотр Авито',
    'view_cian': 'Просмотр ЦИАН',
    'view_yandex': 'Просмотр Яндекс',
    'view_domclick': 'Просмотр Домклик',
    'view_xml': 'Просмотр XML',
    'view_other': 'Просмотр (другое)',
    'qr_scan': 'Переход по QR-коду',
    'call': 'Звонок',
    'lead': 'Заявка',
    'favorite': 'В избранном',
    'manual': 'Вручную',
}


def _ok(body, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(msg, status=400):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _get_user(event, cur):
    token = (event.get('headers') or {}).get('x-auth-token') or (event.get('headers') or {}).get('X-Auth-Token', '')
    if not token:
        return None
    cur.execute(f"SELECT id, role FROM {SCHEMA}.users WHERE session_token = %s AND is_active = TRUE LIMIT 1", (token,))
    row = cur.fetchone()
    return dict(row) if row else None


def handler(event: dict, context) -> dict:
    """Статистика по объектам: запись и чтение просмотров, звонков, заявок с разных площадок."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    dsn = os.environ['DATABASE_URL']

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── POST: записать событие ──────────────────────────────────────
            if method == 'POST':
                body = json.loads(event.get('body') or '{}')
                listing_id = body.get('listing_id')
                event_type = body.get('event_type', '')
                source = body.get('source', 'site')
                count = max(1, int(body.get('count') or 1))
                note = body.get('note', '')

                if not listing_id or not event_type:
                    return _err('listing_id и event_type обязательны')

                # view_site — публичный, не требует авторизации
                if event_type == 'view_site':
                    cur.execute(
                        f"UPDATE {SCHEMA}.listings SET views_site = views_site + 1 WHERE id = %s",
                        (listing_id,)
                    )
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.listing_stats (listing_id, event_type, source, count) VALUES (%s, %s, %s, %s)",
                        (listing_id, 'view_site', 'site', 1)
                    )
                    conn.commit()
                    return _ok({'ok': True})

                # qr_scan — публичный: фиксируем переход по QR-коду на объект
                if event_type == 'qr_scan':
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.listing_stats (listing_id, event_type, source, count) VALUES (%s, %s, %s, %s)",
                        (listing_id, 'qr_scan', 'qr', 1)
                    )
                    conn.commit()
                    return _ok({'ok': True})

                # Все остальные события — только авторизованные
                user = _get_user(event, cur)
                if not user:
                    return _err('Необходима авторизация', 401)

                allowed_roles = ('admin', 'editor', 'manager', 'director', 'broker', 'office_manager')
                if user['role'] not in allowed_roles:
                    return _err('Недостаточно прав', 403)

                cur.execute(
                    f"INSERT INTO {SCHEMA}.listing_stats (listing_id, event_type, source, count, note, recorded_by) "
                    f"VALUES (%s, %s, %s, %s, %s, %s)",
                    (listing_id, event_type, source, count, note or None, user['id'])
                )
                conn.commit()
                return _ok({'ok': True})

            # ── GET: читать статистику ──────────────────────────────────────
            if method == 'GET':
                listing_id = params.get('listing_id')
                if not listing_id:
                    return _err('listing_id обязателен')

                # Сводка
                cur.execute(
                    f"SELECT views_site FROM {SCHEMA}.listings WHERE id = %s",
                    (listing_id,)
                )
                row = cur.fetchone()
                if not row:
                    return _err('Объект не найден', 404)

                views_site = row['views_site'] or 0

                # Агрегация по event_type + source
                cur.execute(
                    f"""
                    SELECT
                        event_type,
                        source,
                        SUM(count)::int AS total,
                        MAX(recorded_at) AS last_at
                    FROM {SCHEMA}.listing_stats
                    WHERE listing_id = %s
                    GROUP BY event_type, source
                    ORDER BY event_type, source
                    """,
                    (listing_id,)
                )
                agg = [dict(r) for r in cur.fetchall()]

                # Сумма по источникам
                source_totals: dict = {}
                event_totals: dict = {}
                for a in agg:
                    src = a['source']
                    ev = a['event_type']
                    source_totals[src] = source_totals.get(src, 0) + a['total']
                    event_totals[ev] = event_totals.get(ev, 0) + a['total']

                # История — последние 50 записей
                history = []
                if params.get('history') == '1':
                    cur.execute(
                        f"""
                        SELECT s.id, s.event_type, s.source, s.count, s.note, s.recorded_at,
                               u.name as user_name
                        FROM {SCHEMA}.listing_stats s
                        LEFT JOIN {SCHEMA}.users u ON u.id = s.recorded_by
                        WHERE s.listing_id = %s
                        ORDER BY s.recorded_at DESC
                        LIMIT 50
                        """,
                        (listing_id,)
                    )
                    history = [dict(r) for r in cur.fetchall()]

                return _ok({
                    'listing_id': int(listing_id),
                    'views_site': views_site,
                    'aggregated': agg,
                    'source_totals': source_totals,
                    'event_totals': event_totals,
                    'source_labels': SOURCE_LABELS,
                    'event_labels': EVENT_LABELS,
                    'history': history,
                })

            return _err('Method not allowed', 405)
    finally:
        conn.close()