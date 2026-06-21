"""
Prerender для поисковых ботов: возвращает HTML с мета-тегами, JSON-LD
и текстовым контентом из БД для каждого типа страниц.

Вызывается Edge-функцией (netlify/edge-functions/bot-render.ts) по параметру ?path=<pathname>.
"""
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

SITE_URL  = 'https://bmn.su'
SITE_NAME = 'Бизнес. Маркетинг. Недвижимость.'
DEFAULT_TITLE = f'{SITE_NAME} — Коммерческая недвижимость Краснодар'
DEFAULT_DESC  = 'Коммерческая недвижимость и готовый бизнес в Краснодаре. Офисы, торговые площади, склады, рестораны, гостиницы.'

CATEGORY_LABELS = {
    'office': 'Офисы', 'retail': 'Торговые помещения', 'warehouse': 'Склады',
    'restaurant': 'Рестораны', 'hotel': 'Гостиницы', 'business': 'Готовый бизнес',
    'gab': 'Готовый арендный бизнес', 'production': 'Производство',
    'land': 'Земельные участки', 'building': 'Здания',
    'free_purpose': 'Свободного назначения', 'car_service': 'Автосервисы',
}

# TTL кэша по типу страницы (секунды)
TTL_BY_TYPE = {
    'object':   600,   # 10 мин — цены меняются
    'news':     1800,  # 30 мин
    'category': 900,   # 15 мин
    'district': 1800,  # 30 мин
    'static':   3600,  # 1 час — главная, map, leads
}


def _esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _resp(status, html, page_type='static'):
    ttl = TTL_BY_TYPE.get(page_type, 3600)
    return {
        'statusCode': status,
        'headers': {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': f'public, max-age={ttl}, s-maxage={ttl}',
            'X-Robots-Tag': 'noindex' if status == 404 else '',
        },
        'body': html,
        'isBase64Encoded': False,
    }


def _html(title, desc, og_image='', canonical='', extra_meta='',
          is_404=False, h1='', body_text='', jsonld=''):
    """Формирует полноценный HTML для поисковых ботов."""
    robots    = '<meta name="robots" content="noindex, nofollow">' if is_404 else '<meta name="robots" content="index, follow">'
    pre_code  = '<meta name="prerender-status-code" content="404">' if is_404 else ''
    og_img    = f'<meta property="og:image" content="{_esc(og_image)}">' if og_image else ''
    og_url    = f'<meta property="og:url" content="{_esc(canonical)}">' if canonical else ''
    canon_tag = f'<link rel="canonical" href="{_esc(canonical)}">' if canonical else ''
    jsonld_tag = f'<script type="application/ld+json">{jsonld}</script>' if jsonld else ''
    t = _esc(title)
    d = _esc(desc)
    return (
        f'<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>{t}</title>'
        f'<meta name="description" content="{d}">'
        f'{robots}{pre_code}{canon_tag}'
        f'<meta property="og:type" content="website">'
        f'<meta property="og:site_name" content="{_esc(SITE_NAME)}">'
        f'<meta property="og:title" content="{t}">'
        f'<meta property="og:description" content="{d}">'
        f'{og_url}{og_img}'
        f'{extra_meta}'
        f'{jsonld_tag}'
        f'</head><body>'
        f'<h1>{_esc(h1 or title)}</h1>'
        f'{body_text}'
        f'</body></html>'
    )


def _jsonld_breadcrumb(items):
    """BreadcrumbList JSON-LD. items = [('Название', 'https://...'), ...]"""
    list_items = []
    for pos, (name, url) in enumerate(items, 1):
        list_items.append({
            '@type': 'ListItem',
            'position': pos,
            'name': name,
            'item': url,
        })
    return json.dumps({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': list_items,
    }, ensure_ascii=False)


def _get_listing_meta(cur, lid):
    cur.execute(f"""
        SELECT id, title, slug, seo_title, seo_description, description,
               price, area, category, address, city, image, updated_at, deal
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
    area_str  = f"{d['area']} м²" if d.get('area') else ''
    city      = d.get('city') or 'Краснодар'
    deal_label = 'Аренда' if d.get('deal') == 'rent' else 'Продажа'

    title = d.get('seo_title') or d.get('title') or DEFAULT_TITLE
    if len(title) > 68:
        title = title[:65] + '...'

    desc = d.get('seo_description') or ''
    if not desc:
        parts = [p for p in [cat_label, area_str, price_str, city] if p]
        desc = (d.get('description') or '')[:120] or ', '.join(parts)
    if len(desc) > 160:
        desc = desc[:157] + '...'

    slug      = d.get('slug') or f"object-{lid}"
    canonical = f"{SITE_URL}/object/{slug}"

    body_parts = []
    if cat_label:
        body_parts.append(f'<p>Категория: {_esc(cat_label)} ({deal_label})</p>')
    if d.get('address'):
        body_parts.append(f'<p>Адрес: {_esc(d["address"])}, {_esc(city)}</p>')
    if area_str:
        body_parts.append(f'<p>Площадь: {_esc(area_str)}</p>')
    if price_str:
        body_parts.append(f'<p>Цена: {_esc(price_str)}</p>')
    if d.get('description'):
        body_parts.append(f'<p>{_esc((d["description"] or "")[:500])}</p>')
    # Ссылки навигации для краулера
    cat_slug = d.get('category') or ''
    cat_link = f' | <a href="/catalog/{cat_slug}">{_esc(cat_label)}</a>' if cat_slug else ''
    body_parts.append(f'<nav><a href="/">Главная</a> | <a href="/catalog">Каталог</a>{cat_link}</nav>')

    # JSON-LD: Product + BreadcrumbList
    product = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Product',
                'name': d.get('title') or title,
                'description': (d.get('description') or desc)[:500],
                'url': canonical,
                'image': (d.get('image') or '').split('|')[0] or None,
                'offers': {
                    '@type': 'Offer',
                    'price': str(int(d['price'])) if d.get('price') else None,
                    'priceCurrency': 'RUB',
                    'availability': 'https://schema.org/InStock',
                },
                'address': {
                    '@type': 'PostalAddress',
                    'addressLocality': city,
                    'streetAddress': d.get('address') or '',
                    'addressCountry': 'RU',
                },
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Каталог', SITE_URL + '/catalog'),
                (cat_label, SITE_URL + f'/catalog/{d.get("category")}'),
                (d.get('title') or title, canonical),
            ])),
        ],
    }
    # Убираем None-значения из offers
    product['@graph'][0]['offers'] = {k: v for k, v in product['@graph'][0]['offers'].items() if v is not None}
    if not product['@graph'][0].get('image'):
        del product['@graph'][0]['image']

    return {
        'title': title,
        'desc': desc,
        'og_image': (d.get('image') or '').split('|')[0],
        'canonical': canonical,
        'h1': d.get('title') or title,
        'body_text': ''.join(body_parts),
        'jsonld': json.dumps(product, ensure_ascii=False),
    }


def _get_news_meta(cur, slug):
    safe_slug = slug.replace("'", "''")[:300]
    cur.execute(f"""
        SELECT title, summary, content, image_url, slug, published_at
        FROM {SCHEMA}.news
        WHERE slug = '{safe_slug}' AND is_published = TRUE
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d         = dict(row)
    title     = (d.get('title') or DEFAULT_TITLE)[:68]
    desc      = (d.get('summary') or (d.get('content') or '')[:157] or DEFAULT_DESC)[:160]
    canonical = f"{SITE_URL}/news/{d['slug']}"
    pub_date  = str(d.get('published_at') or '')[:10]

    article = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'NewsArticle',
                'headline': title,
                'description': desc,
                'url': canonical,
                'image': d.get('image_url') or None,
                'datePublished': pub_date,
                'publisher': {
                    '@type': 'Organization',
                    'name': SITE_NAME,
                    'url': SITE_URL,
                },
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Новости', SITE_URL + '/news'),
                (title, canonical),
            ])),
        ],
    }
    if not article['@graph'][0].get('image'):
        del article['@graph'][0]['image']

    return {
        'title': title,
        'desc': desc,
        'og_image': d.get('image_url') or '',
        'canonical': canonical,
        'h1': d.get('title') or title,
        'body_text': f'<p>{_esc(desc)}</p><nav><a href="/">Главная</a> | <a href="/news">Новости</a></nav>',
        'jsonld': json.dumps(article, ensure_ascii=False),
    }


def _get_category_meta(cur, cat):
    label = CATEGORY_LABELS.get(cat, cat)
    cur.execute(f"""
        SELECT COUNT(*) as cnt, MIN(price) as min_price, MAX(price) as max_price
        FROM {SCHEMA}.listings
        WHERE category = '{cat.replace("'","''")}' AND status = 'active' AND is_visible = TRUE
    """)
    row   = cur.fetchone()
    cnt   = (dict(row).get('cnt') or 0) if row else 0
    title = f'{label} в Краснодаре — {cnt} объектов'
    desc  = f'Аренда и продажа: {label.lower()} в Краснодаре. {cnt} актуальных предложений на {SITE_NAME}.'
    canonical = f"{SITE_URL}/catalog/{cat}"

    item_list = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'ItemList',
                'name': title,
                'description': desc,
                'url': canonical,
                'numberOfItems': cnt,
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Каталог', SITE_URL + '/catalog'),
                (label, canonical),
            ])),
        ],
    }

    return {
        'title': title[:68],
        'desc': desc[:160],
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': (f'<p>{_esc(desc)}</p>'
                      f'<nav><a href="/">Главная</a> | <a href="/catalog">Все категории</a></nav>'),
        'jsonld': json.dumps(item_list, ensure_ascii=False),
    }


def _get_district_meta(cur, d_slug):
    safe = d_slug.replace("'", "''")[:100]
    cur.execute(f"""
        SELECT d.name, d.description, COUNT(l.id) as cnt
        FROM {SCHEMA}.districts d
        LEFT JOIN {SCHEMA}.listings l
            ON l.district = d.name AND l.status = 'active' AND l.is_visible = TRUE
        WHERE d.slug = '{safe}'
        GROUP BY d.name, d.description
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d    = dict(row)
    name = d.get('name') or d_slug
    cnt  = d.get('cnt') or 0
    title = f'Коммерческая недвижимость {name} — {cnt} объектов'
    desc  = d.get('description') or f'Аренда и продажа коммерческой недвижимости в районе {name}, Краснодар. {cnt} предложений.'
    canonical = f"{SITE_URL}/district/{d_slug}"

    breadcrumb = json.loads(_jsonld_breadcrumb([
        ('Главная', SITE_URL + '/'),
        ('Каталог', SITE_URL + '/catalog'),
        (f'Район {name}', canonical),
    ]))

    return {
        'title': title[:68],
        'desc': (desc or '')[:160],
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': (f'<p>{_esc((desc or "")[:300])}</p>'
                      f'<nav><a href="/">Главная</a> | <a href="/catalog">Каталог</a></nav>'),
        'jsonld': json.dumps({'@context': 'https://schema.org', '@graph': [breadcrumb]}, ensure_ascii=False),
    }


def _get_static_meta(path):
    MAP = {
        '/':                (DEFAULT_TITLE, DEFAULT_DESC),
        '/catalog':         ('Каталог коммерческой недвижимости Краснодара', 'Все объекты коммерческой недвижимости в Краснодаре. Офисы, склады, рестораны, гостиницы.'),
        '/news':            ('Новости рынка коммерческой недвижимости Краснодара', 'Актуальные новости и аналитика рынка коммерческой недвижимости Краснодара.'),
        '/leads':           ('Запросы на аренду и покупку недвижимости в Краснодаре', 'Актуальные заявки от арендаторов и покупателей коммерческой недвижимости.'),
        '/map':             ('Карта коммерческой недвижимости Краснодара', 'Интерактивная карта объектов коммерческой недвижимости в Краснодаре.'),
        '/network-tenants': ('Сетевые арендаторы в Краснодаре', 'Федеральные и региональные сетевые арендаторы в поиске помещений в Краснодаре.'),
    }
    title, desc = MAP.get(path, (DEFAULT_TITLE, DEFAULT_DESC))
    canonical   = f"{SITE_URL}{path}"

    breadcrumb_items = [('Главная', SITE_URL + '/')]
    if path != '/':
        breadcrumb_items.append((title, canonical))

    return {
        'title': title,
        'desc': desc,
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': '',
        'jsonld': _jsonld_breadcrumb(breadcrumb_items),
    }


def handler(event: dict, context):
    """
    Prerender для поисковых ботов: возвращает HTML с мета-тегами, JSON-LD
    и текстовым контентом из БД.
    Вызывается Edge-функцией (netlify/edge-functions/bot-render.ts).
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
    # Убираем query-string если попала в path
    path = path.split('?')[0].rstrip('/')
    if not path:
        path = '/'

    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=SITE_URL), 'static')

    conn = None
    cur  = None
    try:
        conn = psycopg2.connect(dsn)
        cur  = conn.cursor(cursor_factory=RealDictCursor)
    except Exception as e:
        print(f'[prerender] DB connect error: {e}')
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=f'{SITE_URL}{path}'), 'static')

    try:
        # /object/{slug-с-id} — id всегда последнее число в slug
        m = re.match(r'^/object/.*?(\d+)/?$', path)
        if m:
            lid  = int(m.group(1))
            meta = _get_listing_meta(cur, lid)
            if not meta:
                return _resp(404, _html('Объект не найден', '404 — объект снят или не существует.',
                                        is_404=True, h1='Объект не найден'), 'object')
            return _resp(200, _html(**meta), 'object')

        # /news/{slug}
        m = re.match(r'^/news/([^/]+)/?$', path)
        if m and path != '/news':
            slug = m.group(1)
            meta = _get_news_meta(cur, slug)
            if not meta:
                return _resp(404, _html('Новость не найдена', '404 — новость не существует.',
                                        is_404=True, h1='Новость не найдена'), 'news')
            return _resp(200, _html(**meta), 'news')

        # /catalog/{category}
        m = re.match(r'^/catalog/([a-z_]+)/?$', path)
        if m:
            cat  = m.group(1)
            meta = _get_category_meta(cur, cat)
            return _resp(200, _html(**meta), 'category')

        # /district/{slug}
        m = re.match(r'^/district/([^/]+)/?$', path)
        if m:
            d_slug = m.group(1)
            meta   = _get_district_meta(cur, d_slug)
            if not meta:
                return _resp(404, _html('Район не найден', '404 — страница района не существует.',
                                        is_404=True, h1='Район не найден'), 'district')
            return _resp(200, _html(**meta), 'district')

        # Статические страницы
        if path in STATIC_PATHS:
            meta = _get_static_meta(path)
            return _resp(200, _html(**meta), 'static')

        # Всё остальное — 404
        return _resp(404, _html(
            'Страница не найдена',
            '404 — страница не существует.',
            is_404=True,
            h1='Страница не найдена',
            body_text='<nav><a href="/">На главную</a> | <a href="/catalog">Каталог объектов</a></nav>',
        ), 'static')

    except Exception as e:
        print(f'[prerender] routing error for {path}: {e}')
        return _resp(200, _html(DEFAULT_TITLE, DEFAULT_DESC, canonical=f'{SITE_URL}{path}'), 'static')
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()