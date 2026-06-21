"""
Генерация и раздача sitemap.xml + robots.txt.
Принимает: GET ?action=sitemap_xml|robots_txt|rebuild|status
           POST {action, auth_token?}
Публично: sitemap_xml, robots_txt
Авторизованно: rebuild, status
"""

import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = 't_p71821556_real_estate_catalog_'

ROBOTS_DISALLOW = [
    '/admin', '/admin/', '/login', '/auth', '/signin',
    '/api/', '/private/',
]

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization',
    'Access-Control-Max-Age': '86400',
}


def _ok(body, status=200, content_type='application/json'):
    return {
        'statusCode': status,
        'headers': {**CORS, 'Content-Type': content_type},
        'body': json.dumps(body, ensure_ascii=False, default=str) if content_type == 'application/json' else body,
    }


def _err(code, msg):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg})}


def _site_base_url(cur):
    try:
        cur.execute(f"SELECT site_url FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
        row = cur.fetchone()
        if row and row.get('site_url'):
            url = str(row['site_url']).rstrip('/')
            if url.startswith('http'):
                return url
    except Exception:
        pass
    return os.environ.get('SITE_URL', 'https://bmn.su').rstrip('/')


def _make_slug(title: str, lid) -> str:
    import re
    t = (title or '').lower()
    t = re.sub(r'\s+', '-', t.strip())
    t = re.sub(r'[^a-zа-яё0-9\-]', '', t)[:60]
    return f"{t}-{lid}"


def _url_encode_path(path: str) -> str:
    """URL-кодирует не-ASCII и спецсимволы в пути (кириллица, ², и т.д.)."""
    from urllib.parse import quote
    return quote(path, safe='/:@!$&\'()*+,;=.-_~')


def _build_sitemap_xml(cur) -> tuple:
    """Возвращает (xml_string, urls_count).
    Источники: статические страницы, активные объекты, новости,
               категории (только с объектами), районы (только с объектами), заявки.
    """
    from datetime import datetime
    base = _site_base_url(cur)
    urls = []
    now = datetime.now()

    # Страницы исключённые из индекса
    NOINDEX_PATHS = {'/favorites', '/compare'}

    # 1. Статические страницы
    cur.execute(
        f"SELECT path, updated_at FROM {SCHEMA}.seo_pages "
        f"WHERE noindex = FALSE ORDER BY path"
    )
    for r in cur.fetchall():
        p = r.get('path') or '/'
        if p.startswith('/admin') or p.startswith('/login') or p.startswith('/auth'):
            continue
        if p in NOINDEX_PATHS:
            continue
        urls.append((base + p, r.get('updated_at'), '0.8', 'weekly'))

    # 2. Активные и видимые объекты — приоритет 1.0
    cur.execute(
        f"SELECT id, slug, title, updated_at FROM {SCHEMA}.listings "
        f"WHERE status = 'active' AND is_visible = TRUE "
        f"ORDER BY updated_at DESC NULLS LAST LIMIT 5000"
    )
    for r in cur.fetchall():
        lid = r.get('id')
        slug = r.get('slug') or _make_slug(r.get('title') or '', lid)
        encoded = _url_encode_path(f"/object/{slug}")
        urls.append((base + encoded, r.get('updated_at'), '1.0', 'daily'))

    # 3. Опубликованные новости — lastmod по дате публикации
    cur.execute(
        f"SELECT slug, published_at FROM {SCHEMA}.news "
        f"WHERE is_published = TRUE AND slug IS NOT NULL AND slug != '' "
        f"ORDER BY published_at DESC NULLS LAST LIMIT 2000"
    )
    for r in cur.fetchall():
        slug = r.get('slug')
        if not slug:
            continue
        encoded = _url_encode_path(f"/news/{slug}")
        urls.append((base + encoded, r.get('published_at'), '0.6', 'monthly'))

    # 4. Категории — только с хотя бы 1 активным видимым объектом
    cur.execute(
        f"SELECT category, MAX(updated_at) as last_upd "
        f"FROM {SCHEMA}.listings WHERE status = 'active' AND is_visible = TRUE "
        f"GROUP BY category HAVING COUNT(id) > 0"
    )
    for r in cur.fetchall():
        cat = r.get('category') or ''
        if not cat:
            continue
        urls.append((base + f"/catalog/{cat}", r.get('last_upd') or now, '0.8', 'weekly'))

    # 5. Районы — только с хотя бы 1 активным видимым объектом
    cur.execute(
        f"SELECT d.slug as d_slug, MAX(l.updated_at) as last_upd "
        f"FROM {SCHEMA}.districts d "
        f"INNER JOIN {SCHEMA}.listings l ON l.district = d.name "
        f"  AND l.status = 'active' AND l.is_visible = TRUE "
        f"WHERE d.slug IS NOT NULL AND d.slug != '' AND d.is_active = TRUE "
        f"GROUP BY d.slug"
    )
    for r in cur.fetchall():
        d_slug = r.get('d_slug') or ''
        if not d_slug:
            continue
        urls.append((base + f"/district/{d_slug}", r.get('last_upd') or now, '0.7', 'weekly'))

    # 6. Страница заявок (публичная лента спроса)
    urls.append((base + '/leads', now, '0.5', 'daily'))

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 '
        'http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
    ]
    for u, upd, priority, changefreq in urls:
        u_safe = u.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        lastmod = ''
        if upd:
            try:
                lastmod = f'<lastmod>{upd.strftime("%Y-%m-%d")}</lastmod>'
            except Exception:
                lastmod = ''
        parts.append(
            f'<url><loc>{u_safe}</loc>{lastmod}'
            f'<changefreq>{changefreq}</changefreq>'
            f'<priority>{priority}</priority></url>'
        )
    parts.append('</urlset>')
    return '\n'.join(parts), len(urls)


def _build_robots_txt(cur) -> str:
    base = _site_base_url(cur)
    # Извлекаем домен для директивы Host
    host = base.replace('https://', '').replace('http://', '').rstrip('/')

    lines = ['User-agent: *']
    for d in ROBOTS_DISALLOW:
        lines.append(f'Disallow: {d}')
    lines.append('Allow: /')
    lines.append('')

    # Яндекс-специфичные директивы
    lines.append('User-agent: Yandex')
    for d in ROBOTS_DISALLOW:
        lines.append(f'Disallow: {d}')
    lines.append('Allow: /')
    # Crawl-delay — не перегружать сервер при массовом обходе
    lines.append('Crawl-delay: 1')
    # Clean-param — сообщаем Яндексу какие параметры не меняют контент страницы
    lines.append('Clean-param: utm_source&utm_medium&utm_campaign&utm_term&utm_content&utm_referrer&yclid&gclid&fbclid&_escaped_fragment_')
    # Host — указываем главное зеркало сайта для Яндекса
    lines.append(f'Host: {host}')
    lines.append('')

    lines.append(f'Sitemap: {base}/sitemap.xml')
    return '\n'.join(lines) + '\n'


def _save_sitemap(cur, conn) -> dict:
    xml, count = _build_sitemap_xml(cur)
    safe = xml.replace("'", "''")[:2_000_000]
    cur.execute(
        f"INSERT INTO {SCHEMA}.seo_artifacts (kind, content, urls_count, updated_at) "
        f"VALUES ('sitemap', '{safe}', {int(count)}, NOW()) "
        f"ON CONFLICT (kind) DO UPDATE SET content = EXCLUDED.content, "
        f"urls_count = EXCLUDED.urls_count, updated_at = NOW()"
    )
    conn.commit()
    return {'urls_count': count, 'xml_length': len(xml)}


def _get_user(cur, token):
    if not token:
        return None
    t = token.replace("'", "''")[:100]
    cur.execute(
        f"SELECT u.id, u.role FROM {SCHEMA}.sessions s "
        f"JOIN {SCHEMA}.users u ON u.id = s.user_id "
        f"WHERE s.token = '{t}' AND s.expires_at > NOW() AND u.is_active = TRUE LIMIT 1"
    )
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    """Sitemap и robots.txt — генерация, кэш и раздача."""
    method = event.get('httpMethod', 'GET')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    qs = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            pass

    action = body.get('action') or qs.get('action') or ''
    if method == 'GET' and not action:
        file_q = (qs.get('file') or '').lower()
        if file_q == 'robots':
            action = 'robots_txt'
        elif file_q == 'sitemap':
            action = 'sitemap_xml'
        else:
            action = 'sitemap_xml'

    raw_headers = event.get('headers') or {}
    headers_lc = {k.lower(): v for k, v in raw_headers.items()}
    token = (
        qs.get('auth_token')
        or headers_lc.get('x-auth-token')
        or headers_lc.get('x-authorization')
        or headers_lc.get('authorization', '').replace('Bearer ', '').strip()
        or (body.get('auth_token') if isinstance(body, dict) else '')
        or ''
    )

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # Публичные (без авторизации)
            if action == 'robots_txt':
                return {
                    'statusCode': 200,
                    'headers': {**CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600'},
                    'body': _build_robots_txt(cur),
                }

            if action == 'sitemap_xml':
                from datetime import datetime, timezone, timedelta
                cur.execute(
                    f"SELECT content, urls_count, updated_at FROM {SCHEMA}.seo_artifacts WHERE kind='sitemap'"
                )
                row = cur.fetchone()
                cache_age_minutes = None
                if row and row.get('updated_at'):
                    try:
                        upd = row['updated_at']
                        if upd.tzinfo is None:
                            upd = upd.replace(tzinfo=timezone.utc)
                        cache_age_minutes = (datetime.now(timezone.utc) - upd).total_seconds() / 60
                    except Exception:
                        cache_age_minutes = None

                # Пересобираем если: кэш пуст, или старше 60 минут
                cache_stale = (
                    not row
                    or not row.get('content')
                    or int(row.get('urls_count') or 0) == 0
                    or (cache_age_minutes is not None and cache_age_minutes > 60)
                )
                if cache_stale:
                    _save_sitemap(cur, conn)
                    cur.execute(f"SELECT content FROM {SCHEMA}.seo_artifacts WHERE kind='sitemap'")
                    fresh = cur.fetchone()
                    xml = fresh['content'] if fresh else ''
                else:
                    xml = row['content']
                return {
                    'statusCode': 200,
                    'headers': {**CORS, 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600'},
                    'body': xml,
                }

            # Защищённые
            user = _get_user(cur, token)
            if not user:
                return _err(401, 'Unauthorized')

            if action == 'rebuild':
                result = _save_sitemap(cur, conn)
                return _ok({'ok': True, **result})

            if action == 'status':
                cur.execute(f"SELECT urls_count, updated_at FROM {SCHEMA}.seo_artifacts WHERE kind='sitemap'")
                row = cur.fetchone()
                base = _site_base_url(cur)
                sitemap_count = int(row['urls_count']) if row and row.get('urls_count') else 0

                # Если кэш пуст — автоматически пересобираем
                if sitemap_count == 0:
                    result = _save_sitemap(cur, conn)
                    sitemap_count = result['urls_count']
                    cur.execute(f"SELECT updated_at FROM {SCHEMA}.seo_artifacts WHERE kind='sitemap'")
                    row = cur.fetchone()

                cur.execute(f"SELECT COUNT(id) as cnt FROM {SCHEMA}.listings WHERE status='active'")
                listings = int((cur.fetchone() or {}).get('cnt') or 0)

                cur.execute(f"SELECT COUNT(id) as cnt FROM {SCHEMA}.news WHERE is_published=TRUE AND slug IS NOT NULL AND slug!=''")
                news = int((cur.fetchone() or {}).get('cnt') or 0)

                cur.execute(f"SELECT COUNT(id) as cnt FROM {SCHEMA}.seo_pages WHERE noindex=FALSE")
                static = int((cur.fetchone() or {}).get('cnt') or 0)

                cur.execute(f"SELECT COUNT(DISTINCT category) as cnt FROM {SCHEMA}.listings WHERE status='active'")
                categories = int((cur.fetchone() or {}).get('cnt') or 0)

                cur.execute(
                    f"SELECT COUNT(DISTINCT d.slug) as cnt FROM {SCHEMA}.districts d "
                    f"INNER JOIN {SCHEMA}.listings l ON l.district=d.name AND l.status='active' "
                    f"WHERE d.slug IS NOT NULL AND d.slug!='' AND d.is_active=TRUE"
                )
                districts = int((cur.fetchone() or {}).get('cnt') or 0)

                total_expected = listings + news + static + categories + districts + 1

                return _ok({
                    'sitemap_url': f'{base}/sitemap.xml',
                    'robots_url': f'{base}/robots.txt',
                    'sitemap_exists': sitemap_count > 0,
                    'robots_exists': True,
                    'sitemap_urls_count': sitemap_count,
                    'sitemap_updated_at': row['updated_at'] if row else None,
                    'robots_disallow': ROBOTS_DISALLOW,
                    'breakdown': {
                        'listings': listings,
                        'news': news,
                        'static': static,
                        'categories': categories,
                        'districts': districts,
                        'other': 1,
                        'total_expected': total_expected,
                    },
                })

    finally:
        conn.close()

    return _err(400, 'Unknown action')