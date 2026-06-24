"""
Prerender для поисковых ботов: возвращает HTML с мета-тегами, JSON-LD
и текстовым контентом из БД для каждого типа страниц.

Вызывается слоем-перехватчиком ботов по параметру ?path=<pathname>.
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

# Уникальный SEO-контент категорий — синхронизирован с фронтом (CATEGORY_META).
# h1/description видит и пользователь, и бот → один и тот же контент.
CATEGORY_META = {
    'office': {
        'h1': 'Аренда и продажа офисов в Краснодаре',
        'desc': 'Офисные помещения в Краснодаре на любой бюджет — от небольших кабинетов до целых этажей в бизнес-центрах. Помогаем подобрать офис в центре города, деловых кварталах или на периферии с удобной парковкой.',
    },
    'retail': {
        'h1': 'Торговые помещения в аренду и продажу в Краснодаре',
        'desc': 'Торговые площади на первых линиях улиц, в торговых центрах, жилых комплексах и отдельно стоящих зданиях. Идеально для магазинов, шоурумов, аптек и бутиков.',
    },
    'warehouse': {
        'h1': 'Складские помещения в аренду в Краснодаре',
        'desc': 'Современные склады и складские комплексы в Краснодаре и пригороде — от небольших боксов до логистических центров. Удобный подъезд для фур, ворота секционные, охрана.',
    },
    'restaurant': {
        'h1': 'Помещения под кафе, рестораны и общепит в Краснодаре',
        'desc': 'Готовые и чистовые помещения для открытия кафе, ресторанов, баров, пекарен и фастфуда в Краснодаре. Объекты с вытяжкой, электрической мощностью и разрешённым использованием.',
    },
    'hotel': {
        'h1': 'Гостиницы и мини-отели в продажу и аренду в Краснодаре',
        'desc': 'Действующие и готовые к запуску гостиницы, мини-отели, хостелы и апарт-отели в Краснодаре. Готовые бизнесы с персоналом и клиентской базой.',
    },
    'business': {
        'h1': 'Продажа готового бизнеса в Краснодаре',
        'desc': 'Готовый бизнес с оборудованием, клиентской базой, персоналом и подтверждёнными доходами. Кафе, магазины, производства, сервисные компании — проверенные объекты с документами.',
    },
    'gab': {
        'h1': 'ГАБ — готовый арендный бизнес в Краснодаре',
        'desc': 'Инвестиционные объекты с действующими долгосрочными арендаторами. Стабильный пассивный доход с первого дня владения. Окупаемость 8–12 лет.',
    },
    'production': {
        'h1': 'Аренда производственных помещений в Краснодаре',
        'desc': 'Производственные цеха, мастерские, технические базы и промышленные объекты в Краснодаре и пригороде. Высокие потолки, мощное электроснабжение, удобный подъезд для грузового транспорта.',
    },
    'land': {
        'h1': 'Продажа коммерческих земельных участков в Краснодаре',
        'desc': 'Земельные участки под коммерческое строительство, склады, производство, торговлю в Краснодаре и Краснодарском крае. Участки с подведёнными коммуникациями и разрешённым использованием.',
    },
    'building': {
        'h1': 'Продажа и аренда отдельно стоящих зданий в Краснодаре',
        'desc': 'Административные здания, офисные центры, торговые здания и особняки под бизнес в Краснодаре. Собственная территория, парковка и независимость от управляющих компаний.',
    },
    'free_purpose': {
        'h1': 'Помещения свободного назначения в Краснодаре',
        'desc': 'Универсальные коммерческие помещения без ограничений по виду деятельности. Подходят для медицины, образования, спорта, торговли, сервиса и многих других видов бизнеса.',
    },
    'car_service': {
        'h1': 'Аренда и продажа помещений под автосервис в Краснодаре',
        'desc': 'Помещения под автосервис, СТО, автомойку и шиномонтаж в Краснодаре — боксы с воротами, смотровыми ямами и подведёнными коммуникациями. Готовые автосервисы с оборудованием и клиентской базой.',
    },
}

TTL_BY_TYPE = {
    'object':   600,
    'news':     1800,
    'category': 900,
    'district': 1800,
    'static':   3600,
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
    """
    Полноценный HTML для пользователей и поисковых ботов.
    - Содержит мета-теги, JSON-LD, SEO-контент внутри #root
    - Подключает JS-бандл — React запускается и оживляет страницу (hydration)
    - Поисковики индексируют текст внутри #root без выполнения JS
    """
    robots    = '<meta name="robots" content="noindex, nofollow">' if is_404 else '<meta name="robots" content="index, follow">'
    pre_code  = '<meta name="prerender-status-code" content="404">' if is_404 else ''
    og_img    = f'<meta property="og:image" content="{_esc(og_image)}">' if og_image else ''
    og_url    = f'<meta property="og:url" content="{_esc(canonical)}">' if canonical else ''
    canon_tag = f'<link rel="canonical" href="{_esc(canonical)}">' if canonical else ''
    jsonld_tag = f'<script type="application/ld+json">{jsonld}</script>' if jsonld else ''
    t = _esc(title)
    d = _esc(desc)
    favicon = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/files/favicon-1780486766400.png'
    return (
        f'<!DOCTYPE html><html lang="ru"><head>'
        f'<meta charset="UTF-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">'
        f'<meta name="theme-color" content="#1a3a6b">'
        f'<link rel="icon" type="image/png" href="{favicon}">'
        f'<title>{t}</title>'
        f'<meta name="description" content="{d}">'
        f'{robots}{pre_code}{canon_tag}'
        f'<meta property="og:type" content="website">'
        f'<meta property="og:site_name" content="{_esc(SITE_NAME)}">'
        f'<meta property="og:title" content="{t}">'
        f'<meta property="og:description" content="{d}">'
        f'{og_url}{og_img}'
        f'<meta name="twitter:card" content="summary_large_image">'
        f'<meta name="twitter:title" content="{t}">'
        f'<meta name="twitter:description" content="{d}">'
        f'{extra_meta}'
        f'{jsonld_tag}'
        f'<meta name="yandex-verification" content="7099028f3e2220eb">'
        f'<meta name="google-site-verification" content="_wn0FH8jA1kMdfoNQIVxcMJ2KGd0C2hl2Bgc8nkMOGI">'
        f'<meta name="mailru-domain" content="6dS7udsVWBpJx77O">'
        f'<link rel="sitemap" type="application/xml" href="/sitemap.xml">'
        f'<link rel="preconnect" href="https://cdn.poehali.dev">'
        f'<link rel="preconnect" href="https://functions.poehali.dev">'
        f'<link rel="preconnect" href="https://fonts.googleapis.com">'
        f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        f'<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'">'
        f'<meta name="pp-name" value="real-estate-catalog-redesign">'
        f'<script defer src="https://cdn.poehali.dev/intertnal/js/pp-min-2.js"></script>'
        f'<script defer src="https://cdn.poehali.dev/intertnal/js/route-min.js"></script>'
        f'<script defer src="https://cdn.poehali.dev/intertnal/js/telemetry-min.js"></script>'
        f'</head>'
        f'<body>'
        f'<div id="root">'
        f'<h1>{_esc(h1 or title)}</h1>'
        f'{body_text}'
        f'</div>'
        f'<script type="module" src="/src/main.tsx"></script>'
        f'</body></html>'
    )


def _jsonld_breadcrumb(items):
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


def _fmt_price(price):
    if not price:
        return ''
    return f"{int(price):,}".replace(',', ' ') + ' ₽'


def _listing_card_html(row):
    """HTML-карточка объекта для списка (каталог, район)."""
    d = dict(row)
    slug = d.get('slug') or f"object-{d['id']}"
    url  = f"{SITE_URL}/object/{slug}"
    title = _esc(d.get('title') or '')
    addr  = _esc(d.get('address') or '')
    price = _esc(_fmt_price(d.get('price')))
    area  = _esc(f"{d['area']} м²" if d.get('area') else '')
    deal  = 'Аренда' if d.get('deal') == 'rent' else 'Продажа'
    img   = (d.get('image') or '').split('|')[0]
    img_tag = f'<img src="{_esc(img)}" alt="{title}" loading="lazy">' if img else ''
    parts = [p for p in [area, price] if p]
    meta_str = ' · '.join(parts)
    return (
        f'<article itemscope itemtype="https://schema.org/Product">'
        f'<a href="{_esc(url)}" itemprop="url">'
        f'{img_tag}'
        f'<h2 itemprop="name">{title}</h2>'
        f'</a>'
        f'<p>{_esc(deal)}</p>'
        + ('<p itemprop="description">' + _esc(addr) + '</p>' if addr else '')
        + ('<p>' + meta_str + '</p>' if meta_str else '')
        + '</article>'
    )


def _get_listing_meta(cur, lid):
    cur.execute(f"""
        SELECT id, title, slug, seo_title, seo_description, description,
               price, area, category, address, city, image, updated_at, deal
        FROM {SCHEMA}.listings
        WHERE id = {int(lid)} AND status = 'active'
          AND (is_visible IS NULL OR is_visible = TRUE)
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    cat_label  = CATEGORY_LABELS.get(d.get('category') or '', '')
    price_str  = _fmt_price(d.get('price'))
    area_str   = f"{d['area']} м²" if d.get('area') else ''
    city       = d.get('city') or 'Краснодар'
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
    cat_slug = d.get('category') or ''
    cat_link = f' | <a href="/catalog/{cat_slug}">{_esc(cat_label)}</a>' if cat_slug else ''
    body_parts.append(f'<nav><a href="/">Главная</a> | <a href="/catalog">Каталог</a>{cat_link}</nav>')

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


def _get_category_seo_text(cur, cat):
    """AI-SEO-текст категории из кеша (та же таблица, что у фронта)."""
    try:
        cur.execute(
            f"SELECT seo_text FROM {SCHEMA}.category_seo_cache "
            f"WHERE category = '{cat.replace(chr(39), chr(39) * 2)}' LIMIT 1"
        )
        row = cur.fetchone()
        return (dict(row).get('seo_text') or '').strip() if row else ''
    except Exception:
        return ''


def _get_category_meta(cur, cat):
    label = CATEGORY_LABELS.get(cat, cat)
    meta  = CATEGORY_META.get(cat, {})
    cur.execute(f"""
        SELECT COUNT(*) as cnt, MIN(price) as min_price, MAX(price) as max_price
        FROM {SCHEMA}.listings
        WHERE category = '{cat.replace("'","''")}' AND status = 'active' AND is_visible = TRUE
    """)
    row = cur.fetchone()
    d   = dict(row) if row else {}
    cnt = d.get('cnt') or 0

    # H1 и описание — те же, что видит пользователь на фронте (CATEGORY_META).
    h1    = meta.get('h1') or f'{label} в Краснодаре'
    title = f'{h1} | {SITE_NAME}'
    # Уникальное описание категории + AI-текст из кеша (если есть)
    base_desc = meta.get('desc') or f'Аренда и продажа: {label.lower()} в Краснодаре.'
    ai_text   = _get_category_seo_text(cur, cat)
    desc      = base_desc
    canonical = f"{SITE_URL}/catalog/{cat}"

    # Список объектов для ботов (до 30)
    cur.execute(f"""
        SELECT id, title, slug, price, area, address, deal, image
        FROM {SCHEMA}.listings
        WHERE category = '{cat.replace("'","''")}' AND status = 'active' AND is_visible = TRUE
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 30
    """)
    rows = cur.fetchall() or []

    cards_html = ''.join(_listing_card_html(r) for r in rows)

    # ItemList JSON-LD с реальными объектами
    item_elements = []
    for pos, r in enumerate(rows, 1):
        rd   = dict(r)
        slug = rd.get('slug') or f"object-{rd['id']}"
        item_elements.append({
            '@type': 'ListItem',
            'position': pos,
            'url': f"{SITE_URL}/object/{slug}",
            'name': rd.get('title') or '',
        })

    item_list = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'ItemList',
                'name': title,
                'description': desc,
                'url': canonical,
                'numberOfItems': cnt,
                'itemListElement': item_elements,
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Каталог', SITE_URL + '/catalog'),
                (label, canonical),
            ])),
        ],
    }

    # Перелинковка на другие категории (важно для SEO и для пустых категорий)
    cat_links = ' | '.join(
        f'<a href="/catalog/{k}">{v}</a>'
        for k, v in CATEGORY_LABELS.items() if k != cat
    )

    # Уникальный текстовый блок: описание + AI-текст (тот же, что видит пользователь).
    # Показывается ВСЕГДА, даже если объектов в категории нет.
    seo_block = f'<p>{_esc(base_desc)}</p>'
    if ai_text:
        paragraphs = ''.join(f'<p>{_esc(p.strip())}</p>' for p in ai_text.split(chr(10)) if p.strip())
        seo_block += paragraphs

    if rows:
        listing_block = f'<section>{cards_html}</section>'
    else:
        listing_block = (
            f'<p>Сейчас в категории «{_esc(label)}» нет активных объектов. '
            f'Оставьте заявку — мы подберём подходящий вариант, или посмотрите другие категории ниже.</p>'
        )

    body = (
        f'<section>{seo_block}</section>'
        f'{listing_block}'
        f'<nav>{cat_links}</nav>'
        f'<nav><a href="/">Главная</a> | <a href="/catalog">Все категории</a></nav>'
    )

    return {
        'title': title[:68],
        'desc': base_desc[:160],
        'og_image': '',
        'canonical': canonical,
        'h1': h1,
        'body_text': body,
        'jsonld': json.dumps(item_list, ensure_ascii=False),
    }


def _get_catalog_meta(cur):
    """Главная страница каталога /catalog — все объекты."""
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM {SCHEMA}.listings
        WHERE status = 'active' AND is_visible = TRUE
    """)
    row = cur.fetchone()
    cnt = (dict(row).get('cnt') or 0) if row else 0

    title = f'Каталог коммерческой недвижимости Краснодара — {cnt} объектов'
    desc  = f'Аренда и продажа коммерческой недвижимости в Краснодаре. {cnt} актуальных объектов: офисы, склады, торговые площади, рестораны, гостиницы.'
    canonical = f"{SITE_URL}/catalog"

    # Свежие объекты всех категорий (до 30)
    cur.execute(f"""
        SELECT id, title, slug, price, area, address, deal, image, category
        FROM {SCHEMA}.listings
        WHERE status = 'active' AND is_visible = TRUE
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 30
    """)
    rows = cur.fetchall() or []
    cards_html = ''.join(_listing_card_html(r) for r in rows)

    # Ссылки на категории
    cat_links = ' | '.join(
        f'<a href="/catalog/{k}">{v}</a>'
        for k, v in CATEGORY_LABELS.items()
    )

    # ItemList JSON-LD
    item_elements = []
    for pos, r in enumerate(rows, 1):
        rd   = dict(r)
        slug = rd.get('slug') or f"object-{rd['id']}"
        item_elements.append({
            '@type': 'ListItem',
            'position': pos,
            'url': f"{SITE_URL}/object/{slug}",
            'name': rd.get('title') or '',
        })

    item_list = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'ItemList',
                'name': title,
                'description': desc,
                'url': canonical,
                'numberOfItems': cnt,
                'itemListElement': item_elements,
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Каталог', canonical),
            ])),
        ],
    }

    body = (
        f'<p>{_esc(desc)}</p>'
        f'<nav>{cat_links}</nav>'
        f'<section>{cards_html}</section>'
        f'<nav><a href="/">Главная</a></nav>'
    )

    return {
        'title': title[:68],
        'desc': desc[:160],
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': body,
        'jsonld': json.dumps(item_list, ensure_ascii=False),
    }


def _get_district_meta(cur, d_slug):
    safe = d_slug.replace("'", "''")[:100]
    cur.execute(f"""
        SELECT id, name, description, is_okrug
        FROM {SCHEMA}.districts
        WHERE slug = '{safe}'
        LIMIT 1
    """)
    row = cur.fetchone()
    if not row:
        return None
    d        = dict(row)
    name     = d.get('name') or d_slug
    is_okrug = bool(d.get('is_okrug'))
    place_word = 'округ' if is_okrug else 'район'

    # Список названий районов для выборки объектов:
    # для округа — все его дочерние районы, для района — он сам.
    if is_okrug:
        cur.execute(f"""
            SELECT name FROM {SCHEMA}.districts
            WHERE parent_id = {int(d['id'])} AND is_okrug = FALSE
        """)
        child_names = [dict(r).get('name') for r in (cur.fetchall() or []) if dict(r).get('name')]
        target_names = child_names
    else:
        target_names = [name]

    if target_names:
        in_list = ', '.join("'" + n.replace("'", "''") + "'" for n in target_names)
        cur.execute(f"""
            SELECT COUNT(id) as cnt FROM {SCHEMA}.listings
            WHERE district IN ({in_list}) AND status = 'active' AND is_visible = TRUE
        """)
        cnt = dict(cur.fetchone() or {}).get('cnt') or 0
    else:
        cnt = 0

    title = f'Коммерческая недвижимость {name} — {cnt} объектов'
    if is_okrug:
        desc = d.get('description') or f'Аренда и продажа коммерческой недвижимости в {name}, Краснодар — объекты во всех районах округа. {cnt} предложений.'
    else:
        desc = d.get('description') or f'Аренда и продажа коммерческой недвижимости в районе {name}, Краснодар. {cnt} предложений.'
    canonical = f"{SITE_URL}/district/{d_slug}"

    # Объекты места (до 20)
    if target_names:
        in_list = ', '.join("'" + n.replace("'", "''") + "'" for n in target_names)
        cur.execute(f"""
            SELECT id, title, slug, price, area, address, deal, image
            FROM {SCHEMA}.listings
            WHERE district IN ({in_list}) AND status = 'active' AND is_visible = TRUE
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 20
        """)
        rows = cur.fetchall() or []
    else:
        rows = []
    cards_html = ''.join(_listing_card_html(r) for r in rows)

    # ItemList JSON-LD для района
    item_elements = []
    for pos, r in enumerate(rows, 1):
        rd   = dict(r)
        slug = rd.get('slug') or f"object-{rd['id']}"
        item_elements.append({
            '@type': 'ListItem',
            'position': pos,
            'url': f"{SITE_URL}/object/{slug}",
            'name': rd.get('title') or '',
        })

    crumb_label = name if is_okrug else f'Район {name}'
    breadcrumb = json.loads(_jsonld_breadcrumb([
        ('Главная', SITE_URL + '/'),
        ('Каталог', SITE_URL + '/catalog'),
        (crumb_label, canonical),
    ]))

    graph = [breadcrumb]
    if item_elements:
        graph.insert(0, {
            '@type': 'ItemList',
            'name': title,
            'url': canonical,
            'numberOfItems': cnt,
            'itemListElement': item_elements,
        })

    body = (
        f'<p>{_esc((desc or "")[:300])}</p>'
        f'<section>{cards_html}</section>'
        f'<nav><a href="/">Главная</a> | <a href="/catalog">Каталог</a></nav>'
    )

    return {
        'title': title[:68],
        'desc': (desc or '')[:160],
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': body,
        'jsonld': json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False),
    }


def _get_static_meta(path):
    MAP = {
        '/':                (DEFAULT_TITLE, DEFAULT_DESC),
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


def _get_news_list_meta(cur):
    """Страница /news — список всех опубликованных новостей."""
    title     = 'Новости рынка коммерческой недвижимости Краснодара'
    desc      = 'Актуальные новости и аналитика рынка коммерческой недвижимости Краснодара.'
    canonical = f'{SITE_URL}/news'

    cur.execute(f"""
        SELECT title, slug, summary, image_url, published_at
        FROM {SCHEMA}.news
        WHERE is_published = TRUE
        ORDER BY published_at DESC NULLS LAST
        LIMIT 30
    """)
    rows = cur.fetchall() or []

    cards_html = ''
    item_elements = []
    for pos, row in enumerate(rows, 1):
        d       = dict(row)
        slug    = d.get('slug') or ''
        url     = f"{SITE_URL}/news/{slug}"
        t       = _esc(d.get('title') or '')
        summary = _esc((d.get('summary') or '')[:200])
        img     = d.get('image_url') or ''
        img_tag = f'<img src="{_esc(img)}" alt="{t}" loading="lazy">' if img else ''
        pub     = str(d.get('published_at') or '')[:10]
        cards_html += (
            f'<article>'
            f'<a href="{_esc(url)}">{img_tag}<h2>{t}</h2></a>'
            f'{"<time datetime=" + repr(pub) + ">" + pub + "</time>" if pub else ""}'
            f'{"<p>" + summary + "</p>" if summary else ""}'
            f'</article>'
        )
        item_elements.append({
            '@type': 'ListItem',
            'position': pos,
            'url': url,
            'name': d.get('title') or '',
        })

    jsonld = json.dumps({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'ItemList',
                'name': title,
                'url': canonical,
                'numberOfItems': len(rows),
                'itemListElement': item_elements,
            },
            json.loads(_jsonld_breadcrumb([
                ('Главная', SITE_URL + '/'),
                ('Новости', canonical),
            ])),
        ],
    }, ensure_ascii=False)

    return {
        'title': title,
        'desc': desc,
        'og_image': '',
        'canonical': canonical,
        'h1': title,
        'body_text': f'<section>{cards_html}</section><nav><a href="/">Главная</a></nav>',
        'jsonld': jsonld,
    }


def _notify_indexnow(url):
    """Уведомляет Яндекс IndexNow о новой/обновлённой странице."""
    import urllib.request
    key = os.environ.get('INDEXNOW_KEY', '')
    if not key:
        return
    api = f'https://yandex.com/indexnow?url={url}&key={key}'
    try:
        urllib.request.urlopen(api, timeout=3)
    except Exception as e:
        print(f'[indexnow] error: {e}')


def handler(event: dict, context):
    """
    Prerender для поисковых ботов: возвращает HTML с мета-тегами, JSON-LD
    и текстовым контентом из БД.
    Вызывается слоем-перехватчиком ботов по параметру ?path=<pathname>.
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
        # /object/{slug-с-id}
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

        # /catalog — главная каталога
        if path == '/catalog':
            meta = _get_catalog_meta(cur)
            return _resp(200, _html(**meta), 'category')

        # /news — список новостей
        if path == '/news':
            meta = _get_news_list_meta(cur)
            return _resp(200, _html(**meta), 'news')

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
            if path == '/':
                try:
                    cur.execute(f"SELECT home_seo_text FROM {SCHEMA}.settings LIMIT 1")
                    row = cur.fetchone()
                    seo_text = (dict(row).get('home_seo_text') or '') if row else ''
                    if seo_text:
                        meta['body_text'] = seo_text
                except Exception as e:
                    print(f'[prerender] settings fetch error: {e}')
            return _resp(200, _html(**meta), 'static')

        # 404
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