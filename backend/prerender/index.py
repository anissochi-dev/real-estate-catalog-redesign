import json
import os
import re
import psycopg2

SCHEMA = os.environ.get('DB_SCHEMA', 't_p71821556_real_estate_catalog_')

# Статические публичные страницы, которые всегда существуют (отдаём 200).
STATIC_PATHS = {
    '/', '/catalog', '/map', '/favorites', '/compare',
    '/network-tenants', '/news', '/leads', '/declined',
    # Посадочные страницы категорий
    '/catalog/office', '/catalog/retail', '/catalog/warehouse',
    '/catalog/restaurant', '/catalog/hotel', '/catalog/business',
    '/catalog/gab', '/catalog/production', '/catalog/land',
    '/catalog/building', '/catalog/free_purpose', '/catalog/car_service',
}
# Префиксы публичных разделов.
STATIC_PREFIXES = ('/catalog/', '/district/')


def _resp(status, html, extra_headers=None):
    headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
    }
    if extra_headers:
        headers.update(extra_headers)
    return {'statusCode': status, 'headers': headers, 'body': html, 'isBase64Encoded': False}


def _page(title, status_note='', is_404=False):
    canonical = ''
    if not is_404:
        canonical = '<link rel="canonical" href="/" />'
    prerender_meta = '<meta name="prerender-status-code" content="404" />' if is_404 else ''
    robots_meta = '<meta name="robots" content="noindex, nofollow">' if is_404 else ''
    links = (
        '<nav>'
        '<a href="/">На главную</a> | '
        '<a href="/catalog">Каталог объектов</a>'
        '</nav>'
    ) if is_404 else ''
    return (
        '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
        f'<title>{title}</title>'
        f'{robots_meta}'
        f'{prerender_meta}{canonical}'
        '</head><body>'
        f'<h1>{title}</h1>{status_note}{links}'
        '</body></html>'
    )


def _path_exists(cur, path):
    """Проверяет, существует ли публичная страница по пути."""
    if path in STATIC_PATHS:
        return True
    if any(path.startswith(p) for p in STATIC_PREFIXES):
        return True

    # /object/{slug-с-id} — id всегда в конце слага (последнее число)
    m = re.match(r'^/object/.*?(\d+)/?$', path)
    if m:
        lid = int(m.group(1))
        cur.execute(
            f"SELECT 1 FROM {SCHEMA}.listings WHERE id = {lid} AND status = 'active' LIMIT 1"
        )
        return cur.fetchone() is not None

    # /news/{slug}
    m = re.match(r'^/news/([A-Za-z0-9_-]+)/?$', path)
    if m:
        slug = m.group(1).replace("'", "''")
        cur.execute(
            f"SELECT 1 FROM {SCHEMA}.news WHERE slug = '{slug}' LIMIT 1"
        )
        return cur.fetchone() is not None

    return False


def handler(event: dict, context):
    '''
    Проверяет, существует ли запрошенная страница. Используется для поисковых
    ботов: на несуществующих путях возвращает HTTP 404 (а не 200, как SPA),
    чтобы поисковики не индексировали несуществующие страницы.
    '''
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
    # Отрезаем query-строку, если пришла в составе пути
    path = path.split('?')[0]

    dsn = os.environ.get('DATABASE_URL')
    exists = True
    if dsn:
        try:
            conn = psycopg2.connect(dsn)
            cur = conn.cursor()
            exists = _path_exists(cur, path)
            cur.close()
            conn.close()
        except (psycopg2.Error, ValueError, TypeError):
            # При ошибке БД не отдаём ложный 404 — считаем страницу валидной
            exists = True

    if exists:
        return _resp(200, _page('OK'))
    return _resp(404, _page('Страница не найдена', '<p>404 — страница не существует.</p>', is_404=True))