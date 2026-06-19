"""
Публичный трекер UTM-кликов.

GET  ?link_id=123          — редирект + запись клика (для обёрточных ссылок)
GET  ?action=stats&period=today|30|90|all  — статистика кликов по периодам (требует X-Auth-Token)
POST {link_id}             — явная фиксация клика (вызывается фронтом)
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


def _ok(body, status=200):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


def _err(msg, status=400):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': 'application/json'},
        'body': json.dumps({'error': msg}, ensure_ascii=False),
    }


def _period_filter(period: str) -> str:
    return {
        'today': "clicked_at >= date_trunc('day', NOW())",
        '30':    "clicked_at >= NOW() - INTERVAL '30 days'",
        '90':    "clicked_at >= NOW() - INTERVAL '90 days'",
        'all':   'TRUE',
    }.get(period, "clicked_at >= NOW() - INTERVAL '30 days'")


def handler(event: dict, context) -> dict:
    """Трекер UTM-кликов: фиксация переходов и статистика по периодам."""

    method = event.get('httpMethod', 'GET')
    headers = event.get('headers') or {}
    qs = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    ip = (event.get('requestContext') or {}).get('identity', {}).get('sourceIp') or \
         headers.get('x-forwarded-for', '').split(',')[0].strip() or ''
    ua = headers.get('user-agent') or headers.get('User-Agent') or ''
    referer = headers.get('referer') or headers.get('Referer') or ''

    dsn = os.environ['DATABASE_URL']
    conn = psycopg2.connect(dsn)

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── POST: зафиксировать клик ──────────────────────────────────────
            if method == 'POST':
                body_raw = event.get('body') or '{}'
                body = json.loads(body_raw) if isinstance(body_raw, str) else body_raw
                link_id = body.get('link_id')
                if not link_id:
                    return _err('link_id обязателен')

                # Проверяем что ссылка существует
                cur.execute(f"SELECT id FROM {SCHEMA}.utm_links WHERE id = %s", (int(link_id),))
                if not cur.fetchone():
                    return _err('Ссылка не найдена', 404)

                # Пишем клик
                cur.execute(
                    f"INSERT INTO {SCHEMA}.utm_clicks (link_id, ip, user_agent, referer) VALUES (%s,%s,%s,%s)",
                    (int(link_id), ip[:64] if ip else None, ua[:256] if ua else None, referer[:512] if referer else None),
                )
                # Инкрементируем счётчик на ссылке
                cur.execute(f"UPDATE {SCHEMA}.utm_links SET clicks = clicks + 1 WHERE id = %s", (int(link_id),))
                conn.commit()
                return _ok({'ok': True})

            # ── GET: статистика ────────────────────────────────────────────────
            if method == 'GET':
                action = qs.get('action', '')
                period = qs.get('period', '30')
                pf = _period_filter(period)

                # Проверяем токен для статистики
                token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or qs.get('auth_token', '')
                if not token:
                    return _err('Требуется авторизация', 401)
                cur.execute(
                    f"SELECT id FROM {SCHEMA}.users WHERE token = %s AND is_active = TRUE LIMIT 1",
                    (token,),
                )
                if not cur.fetchone():
                    return _err('Неверный токен', 401)

                # Статистика по всем ссылкам за период
                cur.execute(f"""
                    SELECT
                        l.id, l.url, l.base_url, l.utm_source, l.utm_medium,
                        l.utm_campaign, l.utm_content, l.utm_term,
                        l.listing_id, l.label, l.created_at,
                        li.title AS listing_title,
                        u.name  AS created_by_name,
                        COUNT(c.id) AS clicks_period,
                        l.clicks    AS clicks_total
                    FROM {SCHEMA}.utm_links l
                    LEFT JOIN {SCHEMA}.utm_clicks c ON c.link_id = l.id AND c.{pf}
                    LEFT JOIN {SCHEMA}.listings   li ON li.id = l.listing_id
                    LEFT JOIN {SCHEMA}.users       u  ON u.id  = l.created_by
                    GROUP BY l.id, li.title, u.name
                    ORDER BY clicks_period DESC, l.created_at DESC
                    LIMIT 200
                """)
                links = [dict(r) for r in cur.fetchall()]

                # Статистика по источникам за период
                cur.execute(f"""
                    SELECT l.utm_source,
                           COUNT(DISTINCT l.id) AS links_count,
                           COUNT(c.id)          AS clicks_period,
                           SUM(l.clicks)        AS clicks_total
                    FROM {SCHEMA}.utm_links l
                    LEFT JOIN {SCHEMA}.utm_clicks c ON c.link_id = l.id AND c.{pf}
                    GROUP BY l.utm_source
                    ORDER BY clicks_period DESC
                """)
                sources = [dict(r) for r in cur.fetchall()]

                # Динамика кликов по дням за период
                cur.execute(f"""
                    SELECT DATE(c.clicked_at) AS day, COUNT(*) AS cnt
                    FROM {SCHEMA}.utm_clicks c
                    WHERE c.{pf}
                    GROUP BY DATE(c.clicked_at)
                    ORDER BY day ASC
                """)
                timeline = [{'day': str(r['day']), 'cnt': int(r['cnt'])} for r in cur.fetchall()]

                # Топ-5 кампаний
                cur.execute(f"""
                    SELECT l.utm_campaign, COUNT(c.id) AS clicks_period
                    FROM {SCHEMA}.utm_links l
                    LEFT JOIN {SCHEMA}.utm_clicks c ON c.link_id = l.id AND c.{pf}
                    WHERE l.utm_campaign != ''
                    GROUP BY l.utm_campaign
                    ORDER BY clicks_period DESC LIMIT 5
                """)
                campaigns = [dict(r) for r in cur.fetchall()]

                # Итого за период
                cur.execute(f"""
                    SELECT COUNT(*) AS total_clicks
                    FROM {SCHEMA}.utm_clicks
                    WHERE {pf}
                """)
                total_clicks = cur.fetchone()['total_clicks']

                return _ok({
                    'period': period,
                    'total_clicks': total_clicks,
                    'links': links,
                    'sources': sources,
                    'timeline': timeline,
                    'campaigns': campaigns,
                })

        return _err('Неизвестный запрос', 400)
    finally:
        conn.close()
