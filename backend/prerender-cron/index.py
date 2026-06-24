"""
Крон-функция: автоматическая prerender-индексация всех страниц сайта.
Запускается ежедневно в 01:00 МСК (22:00 UTC).
Читает sitemap.xml и прогревает prerender для каждого URL.
"""
import json
import os
import re
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

PRERENDER_URL   = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff'
SITEMAP_FN_URL  = 'https://functions.poehali.dev/7db3cce2-3ae0-4bbb-bece-5c6076691344?action=sitemap_xml'
SITE_ORIGIN     = 'https://bmn.su'
CONCURRENCY     = 5
TIMEOUT         = 20

STATIC_PATHS = ['/', '/catalog', '/news', '/map', '/network-tenants', '/leads']
SKIP_PATHS   = {'/favorites', '/compare', '/declined', '/login'}


def _fetch(url: str, timeout: int = TIMEOUT) -> tuple[int, str]:
    """Простой HTTP GET, возвращает (status, body)."""
    req = urllib.request.Request(url, headers={'User-Agent': 'prerender-cron/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception as e:
        return 0, str(e)


def _get_sitemap_paths() -> list[str]:
    """Загружает sitemap и возвращает список путей."""
    paths = list(STATIC_PATHS)
    try:
        status, xml = _fetch(SITEMAP_FN_URL)
        if status == 200 and xml:
            locs = re.findall(r'<loc>([^<]+)</loc>', xml)
            for loc in locs:
                loc = loc.strip()
                if not loc.startswith(SITE_ORIGIN):
                    continue
                path = loc[len(SITE_ORIGIN):].rstrip('/') or '/'
                if path not in SKIP_PATHS and path not in paths:
                    paths.append(path)
            print(f'[cron] sitemap: {len(locs)} URL → {len(paths)} путей для обхода')
        else:
            print(f'[cron] sitemap вернул {status}, работаем только со статическими')
    except Exception as e:
        print(f'[cron] ошибка загрузки sitemap: {e}')
    return paths


def _prerender_path(path: str) -> dict:
    """Вызывает prerender для одного пути."""
    url = f'{PRERENDER_URL}/?path={urllib.parse.quote(path)}'
    status, body = _fetch(url)
    ok = status == 200 and '</html>' in body
    return {'path': path, 'status': status, 'ok': ok, 'size': len(body)}


# urllib.parse нужен для quote — импортируем явно
import urllib.parse


def handler(event: dict, context) -> dict:
    """
    Крон-задача: ежедневная prerender-индексация всех страниц.
    Прогревает кеш prerender-функции — поисковые боты получат
    свежий HTML без задержки на холодный старт.
    """
    # Поддержка ручного вызова через HTTP
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
            },
            'body': '',
        }

    # Проверка авторизации при ручном вызове (крон вызывает без токена)
    params = event.get('queryStringParameters') or {}
    is_cron = event.get('requestContext', {}).get('identity', {}).get('sourceIp') in ('', None) \
              or params.get('cron') == '1'

    print(f'[cron] prerender-cron запущен (cron={is_cron})')

    # 1. Собираем пути
    paths = _get_sitemap_paths()
    total = len(paths)
    print(f'[cron] итого страниц: {total}')

    # 2. Параллельный обход
    results = []
    errors = []

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {pool.submit(_prerender_path, p): p for p in paths}
        for future in as_completed(futures):
            try:
                r = future.result()
                results.append(r)
                status_icon = '✓' if r['ok'] else '✗'
                print(f'[cron] {status_icon} {r["path"]} → HTTP {r["status"]} ({r["size"]} байт)')
                if not r['ok']:
                    errors.append(r['path'])
            except Exception as e:
                path = futures[future]
                errors.append(path)
                print(f'[cron] ✗ {path} → исключение: {e}')

    ok_count = sum(1 for r in results if r['ok'])
    print(f'[cron] готово: {ok_count}/{total} ОК, ошибок: {len(errors)}')
    if errors:
        print(f'[cron] ошибки: {", ".join(errors[:10])}{"..." if len(errors) > 10 else ""}')

    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps({
            'ok': True,
            'total': total,
            'success': ok_count,
            'errors': len(errors),
            'error_paths': errors[:20],
        }, ensure_ascii=False),
    }
