"""
SEO-аудит сайта: проверяет объекты на заполненность SEO-полей и возвращает
сводный отчёт + список проблемных объектов для отображения в админке.
Требует авторизации (X-Auth-Token).
Returns: { score, issues: [...], stats: {...}, top_problems: [...] }
"""
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization',
}


def _ok(data):
    return {'statusCode': 200,
            'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps(data, ensure_ascii=False)}


def _err(msg, status=400):
    return {'statusCode': status,
            'headers': {**CORS, 'Content-Type': 'application/json; charset=utf-8'},
            'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _check_auth(event: dict) -> bool:
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    token = (headers.get('x-auth-token') or headers.get('x-authorization') or
             headers.get('authorization', '').replace('Bearer ', ''))
    if not token:
        return False
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return False
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            safe_token = token.replace("'", "''")
            cur.execute(
                f"SELECT id FROM {SCHEMA}users WHERE auth_token = '{safe_token}' AND is_active = TRUE LIMIT 1"
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {**CORS, 'Access-Control-Max-Age': '86400'}, 'body': ''}

    if event.get('httpMethod', 'GET') != 'GET':
        return _err('Method not allowed', 405)

    if not _check_auth(event):
        return _err('Unauthorized', 401)

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _err('DATABASE_URL not configured', 500)

    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Общая статистика активных объектов
            cur.execute(f"""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE seo_title IS NOT NULL AND seo_title != '') AS has_seo_title,
                    COUNT(*) FILTER (WHERE seo_description IS NOT NULL AND seo_description != '') AS has_seo_desc,
                    COUNT(*) FILTER (WHERE description IS NOT NULL AND LENGTH(description) >= 100) AS has_desc,
                    COUNT(*) FILTER (WHERE image IS NOT NULL AND image != '') AS has_image,
                    COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '') AS has_address,
                    COUNT(*) FILTER (WHERE lat IS NOT NULL AND lat != 0 AND lng IS NOT NULL AND lng != 0) AS has_coords,
                    COUNT(*) FILTER (WHERE seo_faq IS NOT NULL) AS has_faq,
                    COUNT(*) FILTER (WHERE LENGTH(title) > 70) AS title_too_long,
                    COUNT(*) FILTER (WHERE LENGTH(title) < 20) AS title_too_short,
                    COUNT(*) FILTER (WHERE description IS NULL OR LENGTH(description) < 50) AS desc_too_short,
                    COUNT(*) FILTER (WHERE price = 0 OR price IS NULL) AS no_price,
                    COUNT(*) FILTER (WHERE area = 0 OR area IS NULL) AS no_area,
                    ROUND(AVG(LENGTH(title))::numeric, 1) AS avg_title_len,
                    ROUND(AVG(LENGTH(COALESCE(description,'')))::numeric, 0) AS avg_desc_len
                FROM {SCHEMA}listings
                WHERE status = 'active'
            """)
            stats_row = dict(cur.fetchone() or {})
            total = int(stats_row.get('total') or 0)

            # Топ-проблемных объектов (без SEO заголовка или описания)
            cur.execute(f"""
                SELECT id, title, category, deal,
                    (seo_title IS NULL OR seo_title = '') AS no_seo_title,
                    (seo_description IS NULL OR seo_description = '') AS no_seo_desc,
                    (description IS NULL OR LENGTH(description) < 50) AS short_desc,
                    (image IS NULL OR image = '') AS no_image,
                    (price IS NULL OR price = 0) AS no_price
                FROM {SCHEMA}listings
                WHERE status = 'active'
                    AND (
                        seo_title IS NULL OR seo_title = ''
                        OR seo_description IS NULL OR seo_description = ''
                        OR description IS NULL OR LENGTH(description) < 50
                        OR image IS NULL OR image = ''
                    )
                ORDER BY id DESC
                LIMIT 30
            """)
            problem_rows = [dict(r) for r in cur.fetchall()]

            # Считаем SEO-score (0..100)
            if total == 0:
                score = 100
                issues = []
            else:
                def pct(n): return round(int(n or 0) / total * 100)
                checks = [
                    ('seo_title', pct(stats_row.get('has_seo_title')), 20,
                     f"{total - int(stats_row.get('has_seo_title') or 0)} объектов без SEO-заголовка"),
                    ('seo_desc', pct(stats_row.get('has_seo_desc')), 20,
                     f"{total - int(stats_row.get('has_seo_desc') or 0)} объектов без SEO-описания"),
                    ('description', pct(stats_row.get('has_desc')), 15,
                     f"{int(stats_row.get('desc_too_short') or 0)} объектов с коротким описанием (<100 симв.)"),
                    ('image', pct(stats_row.get('has_image')), 15,
                     f"{total - int(stats_row.get('has_image') or 0)} объектов без фото"),
                    ('address', pct(stats_row.get('has_address')), 10,
                     f"{total - int(stats_row.get('has_address') or 0)} объектов без адреса"),
                    ('coords', pct(stats_row.get('has_coords')), 10,
                     f"{total - int(stats_row.get('has_coords') or 0)} объектов без координат"),
                    ('faq', pct(stats_row.get('has_faq')), 10,
                     f"{total - int(stats_row.get('has_faq') or 0)} объектов без FAQ"),
                ]
                score = 0
                issues = []
                for key, fill_pct, weight, msg in checks:
                    score += round(fill_pct / 100 * weight)
                    if fill_pct < 100:
                        severity = 'error' if fill_pct < 50 else 'warning' if fill_pct < 80 else 'info'
                        issues.append({'key': key, 'message': msg, 'fill_pct': fill_pct, 'severity': severity})

            return _ok({
                'score': score,
                'total': total,
                'stats': {
                    'has_seo_title': int(stats_row.get('has_seo_title') or 0),
                    'has_seo_desc': int(stats_row.get('has_seo_desc') or 0),
                    'has_desc': int(stats_row.get('has_desc') or 0),
                    'has_image': int(stats_row.get('has_image') or 0),
                    'has_address': int(stats_row.get('has_address') or 0),
                    'has_coords': int(stats_row.get('has_coords') or 0),
                    'has_faq': int(stats_row.get('has_faq') or 0),
                    'title_too_long': int(stats_row.get('title_too_long') or 0),
                    'title_too_short': int(stats_row.get('title_too_short') or 0),
                    'no_price': int(stats_row.get('no_price') or 0),
                    'no_area': int(stats_row.get('no_area') or 0),
                    'avg_title_len': float(stats_row.get('avg_title_len') or 0),
                    'avg_desc_len': float(stats_row.get('avg_desc_len') or 0),
                },
                'issues': issues,
                'top_problems': problem_rows,
            })
    finally:
        conn.close()