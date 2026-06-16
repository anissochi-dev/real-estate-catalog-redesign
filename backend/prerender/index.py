import json
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('DB_SCHEMA', 't_p71821556_real_estate_catalog_')

STATIC_PATHS = {
    '/', '/catalog', '/map', '/favorites', '/compare',
    '/network-tenants', '/news', '/leads', '/declined',
    '/catalog/office', '/catalog/retail', '/catalog/warehouse',
    '/catalog/restaurant', '/catalog/hotel', '/catalog/business',
    '/catalog/gab', '/catalog/production', '/catalog/land',
    '/catalog/building', '/catalog/free_purpose', '/catalog/car_service',
}
STATIC_PREFIXES = ('/catalog/', '/district/')

SITE_URL = 'https://bmn.su'
SITE_NAME = 'Бизнес. Маркетинг. Недвижимость.'
DEFAULT_TITLE = f'{SITE_NAME} — Коммерческая недвижимость Краснодар'
DEFAULT_DESC = 'Коммерческая недвижимость и готовый бизнес в Краснодаре. Офисы, торговые площади, склады, рестораны, гостиницы.'

CATEGORY_LABELS = {
    'office': 'Офисы', 'retail': 'Торговые помещения', 'warehouse': 'Склады',
    'restaurant': 'Рестораны', 'hotel': 'Гостиницы', 'business': 'Готовый бизнес',
    'gab': 'Готовый арендный бизнес', 'production': 'Производство',
    'land': 'Земельные участки', 'building': 'Здания', 'free_purpose': 'Свободного назначения',
    'car_service': 'Автосервисы',
}


def _esc(s):
    """Экранирует HTML-спецсимволы."""
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _resp(status, html):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
            'X-Robots-Tag': 'noindex' if status == 404 else '',
        },
        'body': html,
        'isBase64Encoded': False,
    }


def _html(title, desc, og_image='', canonical='', extra_meta='', is_404=False, h1='', body_text=''):
    """Формирует полноценный HTML для поисковых ботов."""
    robots = '<meta name="robots" content="noindex, nofollow">' if is_404 else '<meta name="robots" content="index, follow">'
    prerender_code = '<meta name="prerender-status-code" content="404">' if is_404 else ''
    og_img_tag = f'<meta property="og:image" content="{_esc(og_image)}">' if og_image else ''
    canon_tag = f'<link rel="canonical" href="{_esc(canonical)}">' if canonical else ''
    t = _esc(title)
    d = _esc(desc)
    return (
        f'<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>{t}</title>'
        f'<meta name="description" content="{d}">'
        f'{robots}{prerender_code}{canon_tag}'
        f'<meta property="og:title" content="{t}">'
        f'<meta property="og:description" content="{d}">'
        f'<meta property="og:site_name" content="{_esc(SITE_NAME)}">'
        f'{og_img_tag}'
        f'{extra_meta}'
        f'</head><body>'
        f'<h1>{_esc(h1 or title)}</h1>'
        f'{body_text}'
        f'</body></html>'
    )


def _get_listing_meta(cur, lid):
    """Возвращает мета-данные объекта из БД. None если не найден."""
    cur.execute(f"""
        SELECT id, title, slug, seo_title, seo_description, description,
               price, area, category, address, image, updated_at
        FROM {SCHEMA}.listings
        WHERE id = {int(lid)} AND status = 'active'
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    cat_label = CATEGORY_LABELS.get(d.get('category') or '', '')
    price_str = f"{int(d['price']):,}".replace(',', ' ') + ' ₽' if d.get('price') else ''
    area_str = f"{d['area']} м²" if d.get('area') else ''

    title = d.get('seo_title') or d.get('title') or DEFAULT_TITLE
    if len(title) > 68:
        title = title[:65] + '...'

    desc = d.get('seo_description') or ''
    if not desc:
        parts = [p for p in [cat_label, area_str, price_str, 'Краснодар'] if p]
        desc = (d.get('description') or '')[:120] or ', '.join(parts)
    if len(desc) > 160:
        desc = desc[:157] + '...'

    slug = d.get('slug') or f"object-{lid}"
    canonical = f"{SITE_URL}/object/{slug}"

    body_parts = []
    if d.get('address'):
        body_parts.append(f'<p>Адрес: {_esc(d["address"])}</p>')
    if area_str:
        body_parts.append(f'<p>Площадь: {_esc(area_str)}</p>')
    if price_str:
        body_parts.append(f'<p>Цена: {_esc(price_str)}</p>')
    if d.get('description'):
        body_parts.append(f'<p>{_esc((d["description"] or "")[:500])}</p>')

    return {
        'title': title,
        'desc': desc,
        'og_image': (d.get('image') or '').split('|')[0],
        'canonical': canonical,
        'h1': d.get('title') or title,
        'body': ''.join(body_parts),
    }


def _get_news_meta(cur, slug):
    """Возвращает мета-данные новости из БД."""
    safe_slug = slug.replace("'", "''")[:300]
    cur.execute(f"""
        SELECT title, summary, content, image_url, slug
        FROM {SCHEMA}.news
        WHERE slug = '{safe_slug}' AND is_published = TRUE
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    title = (d.get('title') or DEFAULT_TITLE)[:68]
    desc = (d.get('summary') or (d.get('content') or '')[:157] or DEFAULT_DESC)[:160]
    return {
        'title': title,
        'desc': desc,
        'og_image': d.get('image_url') or '',
        'canonical': f"{SITE_URL}/news/{d['slug']}",
        'h1': d.get('title') or title,
        'body': f'<p>{_esc(desc)}</p>',
    }


def _get_category_meta(cur, cat):
    """Возвращает мета-данные страницы категории."""
    label = CATEGORY_LABELS.get(cat, cat)
    cur.execute(f"""
        SELECT COUNT(*) as cnt, MIN(price) as min_price, MAX(price) as max_price
        FROM {SCHEMA}.listings
        WHERE category = '{cat.replace("'","''")}' AND status = 'active' AND is_visible = TRUE
    """)
    row = cur.fetchone()
    cnt = (dict(row).get('cnt') or 0) if row else 0
    title = f'{label} в Краснодаре — {cnt} объектов'
    desc = f'Аренда и продажа: {label.lower()} в Краснодаре. {cnt} актуальных предложений на bmn.su.'
    return {
        'title': title[:68],
        'desc': desc[:160],
        'og_image': '',
        'canonical': f"{SITE_URL}/catalog/{cat}",
        'h1': title,
        'body': f'<p>{_esc(desc)}</p>',
    }


def _get_district_meta(cur, d_slug):
    """Возвращает мета-данные страницы района."""
    safe = d_slug.replace("'", "''")[:100]
    cur.execute(f"""
        SELECT d.name, d.description,
               COUNT(l.id) as cnt
        FROM {SCHEMA}.districts d
        LEFT JOIN {SCHEMA}.listings l ON l.district = d.name AND l.status = 'active' AND l.is_visible = TRUE
        WHERE d.slug = '{safe}'
        GROUP BY d.name, d.description
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    name = d.get('name') or d_slug
    cnt = d.get('cnt') or 0
    title = f'Коммерческая недвижимость {name} — {cnt} объектов'
    desc = d.get('description') or f'Аренда и продажа коммерческой недвижимости в районе {name}, Краснодар. {cnt} предложений.'
    return {
        'title': title[:68],
        'desc': (desc or '')[:160],
        'og_image': '',
        'canonical': f"{SITE_URL}/district/{d_slug}",
        'h1': title,
        'body': f'<p>{_esc(desc[:300])}</p>',
    }


def _get_static_meta(path):
    """Мета-данные для статических страниц."""
    MAP = {
        '/':               (DEFAULT_TITLE, DEFAULT_DESC),
        '/catalog':        ('Каталог коммерческой недвижимости Краснодара', 'Все объекты коммерческой недвижимости в Краснодаре. Офисы, склады, рестораны, гостиницы.'),
        '/news':           ('Новости рынка коммерческой недвижимости Краснодара', 'Актуальные новости и аналитика рынка коммерческой недвижимости Краснодара.'),
        '/leads':          ('Запросы на аренду и покупку недвижимости в Краснодаре', 'Актуальные заявки от арендаторов и покупателей коммерческой недвижимости.'),
        '/map':            ('Карта коммерческой недвижимости Краснодара', 'Интерактивная карта объектов коммерческой недвижимости в Краснодаре.'),
        '/network-tenants':('Сетевые арендаторы в Краснодаре', 'Федеральные и региональные сетевые арендаторы в поиске помещений в Краснодаре.'),
    }
    title, desc = MAP.get(path, (DEFAULT_TITLE, DEFAULT_DESC))
    return {'title': title, 'desc': desc, 'og_image': '', 'canonical': f"{SITE_URL}{path}", 'h1': title, 'body': ''}


def handler(event: dict, context):
    """
    Prerender для поисковых ботов: возвращает HTML с реальными meta-тегами
    из БД (title, description, og:image) для каждого типа страниц.
    404 для несуществующих путей.
    """
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
            'body': '',
        }

    params = event.get('queryStringParameters') or {}
    path = params.get('path') or '/'
    if not path.startswith('/'):
        path = '/' + path
    path = path.split('?')[0].rstrip('/')
    if not path:
        path = '/'

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=SITE_URL))

    conn = None
    cur = None
    try:
        conn = psycopg2.connect(dsn)
        cur = conn.cursor(cursor_factory=RealDictCursor)
    except Exception as e:
        print(f'[prerender] DB connect error: {e}')
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=f'{SITE_URL}{path}'))

    try:
        # /object/{slug-с-id} — id всегда последнее число в slug
        m = re.match(r'^/object/.*?(\d+)/?$', path)
        if m:
            lid = int(m.group(1))
            meta = _get_listing_meta(cur, lid)
            if not meta:
                return _resp(404, _html('Объект не найден', '404 — объект снят или не существует.', is_404=True, h1='Объект не найден'))
            return _resp(200, _html(**meta))

        # /news/{slug}
        m = re.match(r'^/news/([^/]+)/?$', path)
        if m and path != '/news':
            slug = m.group(1)
            meta = _get_news_meta(cur, slug)
            if not meta:
                return _resp(404, _html('Новость не найдена', '404 — новость не существует.', is_404=True, h1='Новость не найдена'))
            return _resp(200, _html(**meta))

        # /catalog/{category}
        m = re.match(r'^/catalog/([a-z_]+)/?$', path)
        if m:
            cat = m.group(1)
            meta = _get_category_meta(cur, cat)
            return _resp(200, _html(**meta))

        # /district/{slug}
        m = re.match(r'^/district/([^/]+)/?$', path)
        if m:
            d_slug = m.group(1)
            meta = _get_district_meta(cur, d_slug)
            if not meta:
                return _resp(404, _html('Район не найден', '404 — страница района не существует.', is_404=True, h1='Район не найден'))
            return _resp(200, _html(**meta))

        # Статические страницы
        if path in STATIC_PATHS:
            meta = _get_static_meta(path)
            return _resp(200, _html(**meta))

        # Всё остальное — 404
        return _resp(404, _html(
            'Страница не найдена',
            '404 — страница не существует.',
            is_404=True,
            h1='Страница не найдена',
            body_text='<nav><a href="/">На главную</a> | <a href="/catalog">Каталог объектов</a></nav>',
        ))

    except Exception as e:
        print(f'[prerender] routing error for {path}: {e}')
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=f'{SITE_URL}{path}'))
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()