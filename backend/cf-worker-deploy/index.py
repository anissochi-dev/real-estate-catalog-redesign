"""
Cloudflare Worker управление: проверка зон, деплой bot-routing Worker, привязка к домену.
"""
import json
import os
import urllib.request
import urllib.error


PRERENDER_URL = 'https://functions.poehali.dev/1111ba70-a6c3-4c58-b8b0-2519af14b7ff'
SITE_DOMAIN   = 'bmn.su'
WORKER_NAME   = 'bmn-bot-router'

# Скрипт Worker — перехватывает ботов и отдаёт prerender
WORKER_SCRIPT = r"""
const BOT_AGENTS = [
  'googlebot','yandexbot','bingbot','baiduspider','duckduckbot',
  'slurp','facebookexternalhit','twitterbot','linkedinbot',
  'whatsapp','telegrambot','vkshare','ok.ru','msnbot',
  'sogou','exabot','semrushbot','ahrefsbot','rogerbot',
  'screaming frog','sitebulb','prerender','lighthouse',
];

const PRERENDER = '__PRERENDER_URL__';

function isBot(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_AGENTS.some(b => lower.includes(b));
}

function isHtmlRequest(req) {
  const url = new URL(req.url);
  const ext = url.pathname.split('.').pop().toLowerCase();
  const staticExts = ['js','css','png','jpg','jpeg','gif','webp','svg','ico','woff','woff2','ttf','json','xml','txt','map'];
  if (staticExts.includes(ext)) return false;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('*/*') || accept === '';
}

export default {
  async fetch(request, env, ctx) {
    const ua = request.headers.get('user-agent') || '';
    const url = new URL(request.url);

    if (isBot(ua) && isHtmlRequest(request)) {
      const prerenderUrl = `${PRERENDER}?path=${encodeURIComponent(url.pathname + url.search)}`;
      try {
        const resp = await fetch(prerenderUrl, {
          headers: { 'X-Prerender-Token': 'internal', 'User-Agent': ua },
          cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (resp.ok) {
          const html = await resp.text();
          return new Response(html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Prerendered': '1',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      } catch (e) {
        // prerender недоступен — отдаём обычный ответ
      }
    }

    // Обычный запрос — проксируем на origin
    return fetch(request);
  },
};
""".replace('__PRERENDER_URL__', PRERENDER_URL)


def cf_request(method, path, token, data=None):
    url = f'https://api.cloudflare.com/client/v4{path}'
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        url, data=body, method=method,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()), r.status
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        try:
            return json.loads(body_err), e.code
        except Exception:
            return {'error': body_err[:300]}, e.code


def handler(event: dict, context) -> dict:
    """Проверяет CF-зону bmn.su, деплоит Worker, привязывает маршрут."""
    token      = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    account_id = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')

    if not token or not account_id:
        return {'statusCode': 500, 'body': json.dumps({'error': 'Секреты CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID не заданы'})}

    action = (event.get('queryStringParameters') or {}).get('action', 'status')

    # ── 1. Проверяем зону ────────────────────────────────────────────────────
    zones_data, zones_status = cf_request('GET', f'/zones?name={SITE_DOMAIN}', token)
    zones = zones_data.get('result', [])
    zone_id = zones[0]['id'] if zones else None
    zone_status = zones[0].get('status') if zones else None
    name_servers = zones[0].get('name_servers', []) if zones else []

    if action == 'status':
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({
                'zone_found': bool(zone_id),
                'zone_id': zone_id,
                'zone_status': zone_status,
                'name_servers': name_servers,
                'domain': SITE_DOMAIN,
                'worker_name': WORKER_NAME,
                'prerender_url': PRERENDER_URL,
            })
        }

    if action == 'deploy':
        if not zone_id:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'error': f'Домен {SITE_DOMAIN} не найден в Cloudflare. Сначала добавьте домен в аккаунт.',
                    'zone_found': False,
                })
            }

        # ── 2. Деплоим Worker ────────────────────────────────────────────────
        worker_url = f'/accounts/{account_id}/workers/scripts/{WORKER_NAME}'
        boundary = 'boundary123456'
        # Multipart upload для ES Module Worker
        body_parts = [
            f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n',
            json.dumps({'main_module': 'worker.js', 'compatibility_date': '2024-01-01'}),
            f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n',
            WORKER_SCRIPT,
            f'\r\n--{boundary}--\r\n',
        ]
        body_bytes = ''.join(body_parts).encode('utf-8')

        req_w = urllib.request.Request(
            f'https://api.cloudflare.com/client/v4{worker_url}',
            data=body_bytes,
            method='PUT',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': f'multipart/form-data; boundary={boundary}',
            }
        )
        try:
            with urllib.request.urlopen(req_w, timeout=30) as r:
                deploy_result = json.loads(r.read().decode())
            deploy_ok = deploy_result.get('success', False)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({'error': f'Ошибка деплоя Worker: {err_body[:400]}', 'deploy_ok': False})
            }

        if not deploy_ok:
            return {
                'statusCode': 500,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Worker не задеплоен', 'detail': deploy_result})
            }

        # ── 3. Привязываем Worker к домену через Route ───────────────────────
        route_data = {
            'pattern': f'{SITE_DOMAIN}/*',
            'script': WORKER_NAME,
        }
        route_result, route_status = cf_request('POST', f'/zones/{zone_id}/workers/routes', token, route_data)
        route_ok = route_result.get('success', False)

        # Если маршрут уже существует — это не ошибка
        route_errors = route_result.get('errors', [])
        already_exists = any('already' in str(e).lower() for e in route_errors)
        if already_exists:
            route_ok = True

        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({
                'deploy_ok': deploy_ok,
                'route_ok': route_ok,
                'worker_name': WORKER_NAME,
                'route_pattern': f'{SITE_DOMAIN}/*',
                'zone_id': zone_id,
                'zone_status': zone_status,
                'route_detail': route_result,
            })
        }

    return {
        'statusCode': 400,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'error': 'Неизвестный action. Доступны: status, deploy'})
    }
