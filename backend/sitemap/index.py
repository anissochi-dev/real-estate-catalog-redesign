"""
Динамический sitemap.xml из БД: объекты, категории, районы, новости.
Доступен по адресу bmn.su/sitemap.xml через Cloudflare Worker.
"""
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

SCHEMA   = os.environ.get('DB_SCHEMA', 't_p71821556_real_estate_catalog_')
SITE_URL = 'https://bmn.su'

STATIC_PAGES = [
    ('/', '1.0', 'daily'),
    ('/catalog', '0.9', 'daily'),
    ('/map', '0.7', 'weekly'),
    ('/news', '0.8', 'daily'),
    ('/network-tenants', '0.6', 'weekly'),
    ('/leads', '0.5', 'weekly'),
]

CATEGORIES = [
    'office', 'retail', 'warehouse', 'restaurant', 'hotel',
    'business', 'gab', 'production', 'land', 'building',
    'free_purpose', 'car_service',
]


def _url(loc, lastmod='', changefreq='weekly', priority='0.7'):
    parts = [f'  <url>', f'    <loc>{loc}</loc>']
    if lastmod:
        parts.append(f'    <lastmod>{lastmod}</lastmod>')
    parts.append(f'    <changefreq>{changefreq}</changefreq>')
    parts.append(f'    <priority>{priority}</priority>')
    parts.append(f'  </url>')
    return '\n'.join(parts)


def handler(event: dict, context):
    """Возвращает sitemap.xml со всеми страницами сайта из БД."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': '',
        }

    today = datetime.utcnow().strftime('%Y-%m-%d')
    urls  = []

    # Статические страницы
    for path, priority, changefreq in STATIC_PAGES:
        urls.append(_url(f'{SITE_URL}{path}', today, changefreq, priority))

    # Категории каталога
    for cat in CATEGORIES:
        urls.append(_url(f'{SITE_URL}/catalog/{cat}', today, 'daily', '0.8'))

    dsn = os.environ.get('DATABASE_URL')
    if dsn:
        conn = psycopg2.connect(dsn)
        cur  = conn.cursor(cursor_factory=RealDictCursor)

        # Активные объекты
        cur.execute(f"""
            SELECT slug, id, updated_at
            FROM {SCHEMA}.listings
            WHERE status = 'active' AND is_visible = TRUE
            ORDER BY updated_at DESC NULLS LAST
        """)
        for row in cur.fetchall():
            d       = dict(row)
            slug    = d.get('slug') or f"object-{d['id']}"
            lastmod = str(d.get('updated_at') or today)[:10]
            urls.append(_url(f'{SITE_URL}/object/{slug}', lastmod, 'weekly', '0.8'))

        # Районы
        cur.execute(f"""
            SELECT d.slug, COUNT(l.id) as cnt
            FROM {SCHEMA}.districts d
            LEFT JOIN {SCHEMA}.listings l
                ON l.district = d.name AND l.status = 'active' AND l.is_visible = TRUE
            GROUP BY d.slug
            HAVING COUNT(l.id) > 0
        """)
        for row in cur.fetchall():
            d = dict(row)
            if d.get('slug'):
                urls.append(_url(f'{SITE_URL}/district/{d["slug"]}', today, 'weekly', '0.6'))

        # Новости
        cur.execute(f"""
            SELECT slug, published_at
            FROM {SCHEMA}.news
            WHERE is_published = TRUE
            ORDER BY published_at DESC NULLS LAST
        """)
        for row in cur.fetchall():
            d       = dict(row)
            lastmod = str(d.get('published_at') or today)[:10]
            urls.append(_url(f'{SITE_URL}/news/{d["slug"]}', lastmod, 'monthly', '0.6'))

        cur.close()
        conn.close()

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(urls) +
        '\n</urlset>'
    )

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
        'body': xml,
        'isBase64Encoded': False,
    }
