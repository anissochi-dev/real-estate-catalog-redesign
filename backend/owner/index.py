"""
API личного кабинета собственника (клиента).
Действия:
  GET  ?action=me         — профиль текущего пользователя
  PUT  ?action=me         — обновить имя/телефон
  GET  ?action=listings   — мои объекты с moderation_status
  GET  ?action=stats&listing_id=X — статистика конкретного объекта (только своего)
  GET  ?action=leads&listing_id=X — заявки по объекту (только своего)
Авторизация: заголовок X-Authorization (токен сессии из auth)
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
}


def _ok(body):
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False, default=str)}


def _err(code, msg):
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _get_token(event):
    h = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    return (h.get('x-authorization') or h.get('authorization') or '').replace('Bearer ', '').strip()


def _auth(cur, token):
    """Возвращает user dict или None. Только role='client'."""
    if not token:
        return None
    safe = token.replace("'", "''")
    cur.execute(
        f"SELECT u.id, u.email, u.name, u.phone, u.avatar, u.role, u.is_active "
        f"FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{safe}' AND s.expires_at > NOW() AND u.is_active = TRUE "
        f"LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return None
    return dict(row)


def handler(event: dict, context) -> dict:
    """Личный кабинет собственника: профиль, объекты, статистика, заявки."""
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', 'me')

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            token = _get_token(event)
            user = _auth(cur, token)
            if not user:
                return _err(401, 'Необходима авторизация')
            if user['role'] != 'client':
                return _err(403, 'Доступ только для собственников')

            uid = user['id']

            # ── GET /me ── профиль ─────────────────────────────────────────────
            if action == 'me' and method == 'GET':
                return _ok({'user': user})

            # ── PUT /me ── обновить профиль ───────────────────────────────────
            if action == 'me' and method == 'PUT':
                body = json.loads(event.get('body') or '{}')
                fields = []
                name = (body.get('name') or '').strip()[:150]
                phone = (body.get('phone') or '').strip()[:30]
                if name:
                    safe_name = name.replace("'", "''")
                    fields.append(f"name = '{safe_name}'")
                if phone:
                    safe_phone = phone.replace("'", "''")
                    fields.append(f"phone = '{safe_phone}'")
                if not fields:
                    return _err(400, 'Нет данных для обновления')
                fields.append('updated_at = NOW()')
                cur.execute(f"UPDATE {SCHEMA}.users SET {', '.join(fields)} WHERE id = {uid}")
                conn.commit()
                return _ok({'success': True})

            # ── GET /listings ── мои объекты ──────────────────────────────────
            if action == 'listings':
                cur.execute(f"""
                    SELECT id, title, category, deal, price, area, address, image,
                           status, is_visible, moderation_comment,
                           views_site, created_at, updated_at,
                           export_yandex, export_avito, export_cian
                    FROM {SCHEMA}.listings
                    WHERE owner_user_id = {uid}
                    ORDER BY created_at DESC
                """)
                listings = [dict(r) for r in cur.fetchall()]
                return _ok({'listings': listings})

            # ── GET /stats ── статистика по объекту ───────────────────────────
            if action == 'stats':
                listing_id = params.get('listing_id')
                if not listing_id:
                    return _err(400, 'Укажите listing_id')
                lid = int(listing_id)

                # Проверяем принадлежность объекта пользователю
                cur.execute(
                    f"SELECT id, status FROM {SCHEMA}.listings "
                    f"WHERE id = {lid} AND owner_user_id = {uid} LIMIT 1"
                )
                listing = cur.fetchone()
                if not listing:
                    return _err(403, 'Объект не найден или недоступен')
                if dict(listing)['status'] not in ('active', 'archived'):
                    return _err(403, 'Статистика доступна только после публикации объекта')

                # Счётчик просмотров из поля listings.views_site
                cur.execute(f"SELECT views_site FROM {SCHEMA}.listings WHERE id = {lid}")
                views_site = (cur.fetchone() or {}).get('views_site') or 0

                # Детальная статистика из listing_stats по источникам
                cur.execute(f"""
                    SELECT source, SUM(count) as total
                    FROM {SCHEMA}.listing_stats
                    WHERE listing_id = {lid}
                    AND event_type = 'view'
                    GROUP BY source
                """)
                sources = {}
                for r in cur.fetchall():
                    sources[r['source']] = int(r['total'])

                # Статистика по дням (последние 30 дней)
                cur.execute(f"""
                    SELECT DATE(recorded_at AT TIME ZONE 'Europe/Moscow') as day,
                           source, SUM(count) as total
                    FROM {SCHEMA}.listing_stats
                    WHERE listing_id = {lid}
                    AND event_type = 'view'
                    AND recorded_at >= NOW() - INTERVAL '30 days'
                    GROUP BY day, source
                    ORDER BY day DESC
                """)
                by_day = [dict(r) for r in cur.fetchall()]

                # Количество заявок
                cur.execute(f"SELECT COUNT(*) as cnt FROM {SCHEMA}.leads WHERE listing_id = {lid}")
                leads_count = (cur.fetchone() or {}).get('cnt') or 0

                return _ok({
                    'listing_id': lid,
                    'views_site': views_site,
                    'views_qr': sources.get('qr', 0),
                    'views_avito': sources.get('avito', 0),
                    'views_yandex': sources.get('yandex', 0),
                    'views_cian': sources.get('cian', 0),
                    'views_total': sum(sources.values()) or views_site,
                    'by_day': by_day,
                    'leads_count': int(leads_count),
                })

            # ── GET /leads ── заявки по объекту ──────────────────────────────
            if action == 'leads':
                listing_id = params.get('listing_id')
                if not listing_id:
                    return _err(400, 'Укажите listing_id')
                lid = int(listing_id)

                # Проверяем принадлежность объекта
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.listings "
                    f"WHERE id = {lid} AND owner_user_id = {uid} "
                    f"AND status NOT IN ('moderation', 'pending') LIMIT 1"
                )
                if not cur.fetchone():
                    return _err(403, 'Объект не найден или недоступен')

                cur.execute(f"""
                    SELECT id, name, phone, message, source, status, lead_type, created_at
                    FROM {SCHEMA}.leads
                    WHERE listing_id = {lid}
                    ORDER BY created_at DESC
                    LIMIT 50
                """)
                leads = [dict(r) for r in cur.fetchall()]
                return _ok({'leads': leads})

            return _err(400, 'Неизвестное действие')

    except Exception as e:
        import traceback
        print(f'[owner] ERROR: {e}\n{traceback.format_exc()}')
        return _err(500, 'Внутренняя ошибка')
    finally:
        conn.close()
