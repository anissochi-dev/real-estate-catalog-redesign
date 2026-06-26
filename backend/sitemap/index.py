"""
Динамический sitemap.xml из БД: объекты, категории, районы, новости.
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
    ('/news', '0.8', 'daily'),
    ('/network-tenants', '0.6', 'weekly'),
    ('/leads', '0.5', 'weekly'),
]

CATEGORIES = [
    'office', 'retail', 'warehouse', 'restaurant', 'hotel',
    'business', 'gab', 'production', 'land', 'building',
    'free_purpose', 'car_service',
]


def _url(loc, lastmod='', changefreq='weekly', priority='0.7', image_url=None, image_title=None):
    parts = [f'  <url>', f'    <loc>{loc}</loc>']
    if lastmod:
        parts.append(f'    <lastmod>{lastmod}</lastmod>')
    parts.append(f'    <changefreq>{changefreq}</changefreq>')
    parts.append(f'    <priority>{priority}</priority>')
    if image_url:
        parts.append(f'    <image:image>')
        parts.append(f'      <image:loc>{image_url}</image:loc>')
        if image_title:
            title_safe = image_title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            parts.append(f'      <image:title>{title_safe}</image:title>')
        parts.append(f'    </image:image>')
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

        # Активные объекты (с image sitemap)
        cur.execute(f"""
            SELECT slug, id, updated_at, title, images
            FROM {SCHEMA}.listings
            WHERE status = 'active' AND is_visible = TRUE
            ORDER BY updated_at DESC NULLS LAST
        """)
        for row in cur.fetchall():
            import json as _json
            d       = dict(row)
            slug    = d.get('slug') or f"object-{d['id']}"
            lastmod = str(d.get('updated_at') or today)[:10]
            img_url = None
            raw_images = d.get('images')
            if raw_images:
                try:
                    imgs = _json.loads(raw_images) if isinstance(raw_images, str) else raw_images
                    if isinstance(imgs, list) and imgs:
                        img_url = imgs[0]
                except Exception:
                    pass
            urls.append(_url(
                f'{SITE_URL}/object/{slug}', lastmod, 'weekly', '0.8',
                image_url=img_url, image_title=d.get('title') or None,
            ))

        # Районы — только активные с объектами
        cur.execute(f"""
            SELECT DISTINCT d.slug
            FROM {SCHEMA}.districts d
            JOIN {SCHEMA}.listings l ON l.district = d.name
            WHERE l.status = 'active'
              AND l.is_visible = TRUE
              AND d.slug IS NOT NULL
              AND d.slug != ''
              AND d.is_active = TRUE
        """)
        for row in cur.fetchall():
            d = dict(row)
            if d.get('slug'):
                urls.append(_url(f'{SITE_URL}/district/{d["slug"]}', today, 'weekly', '0.6'))

        # Новости
        cur.execute(f"""
            SELECT slug, published_at, title, image_url
            FROM {SCHEMA}.news
            WHERE is_published = TRUE
            ORDER BY published_at DESC NULLS LAST
        """)
        for row in cur.fetchall():
            d       = dict(row)
            lastmod = str(d.get('published_at') or today)[:10]
            urls.append(_url(
                f'{SITE_URL}/news/{d["slug"]}', lastmod, 'monthly', '0.6',
                image_url=d.get('image_url') or None,
                image_title=d.get('title') or None,
            ))

        cur.close()
        conn.close()

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
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