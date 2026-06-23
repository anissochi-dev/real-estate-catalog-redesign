"""
VK Ads API — данные рекламного кабинета.
Читает client_id и client_secret из настроек БД,
получает OAuth2-токен и запрашивает: планы, группы, объявления, статистику.
"""

import json
import os
import urllib.request
import urllib.parse
import urllib.error
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta

SCHEMA = 't_p71821556_real_estate_catalog_'
VK_BASE = 'https://ads.vk.com/api/v2'
VK_TOKEN_URL = f'{VK_BASE}/oauth2/token.json'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
}


def _ok(data: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _get(path: str, token: str) -> dict:
    url = f'{VK_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return {'_error': e.code, '_detail': body}
    except Exception as e:
        return {'_error': str(e)}


def _get_token(client_id: str, client_secret: str):
    data = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'permanent': 'true',
    }).encode()
    req = urllib.request.Request(VK_TOKEN_URL, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read().decode())
            return resp.get('access_token'), None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            parsed = json.loads(body)
            detail = parsed.get('error_description') or parsed.get('error') or body
        except Exception:
            detail = body[:300]
        return None, f'HTTP {e.code}: {detail}'
    except Exception as e:
        return None, str(e)


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(f"SELECT vk_ads_client_id, vk_ads_client_secret FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    row = cur.fetchone()
    conn.close()

    client_id = (row.get('vk_ads_client_id') or '').strip() if row else ''
    client_secret = (row.get('vk_ads_client_secret') or '').strip() if row else ''

    if not client_id or not client_secret:
        return _err(400, 'VK Ads не настроен: заполните Client ID и Client Secret в Настройках → Интеграции')

    token, token_err = _get_token(client_id, client_secret)
    if not token:
        return _err(401, f'Не удалось получить токен VK Ads: {token_err}')

    # Даты для статистики: последние 30 дней
    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    # 1. Рекламные планы — правильные поля VK Ads API v2
    plans = _get('/ad_plans.json?fields=id,name,status,budget_limit,budget_limit_day,date_start,date_end,objective,delivery&limit=50', token)

    # 2. Рекламные группы
    groups = _get('/ad_groups.json?fields=id,ad_plan_id,name,status,budget_limit,budget_limit_day,delivery&limit=50', token)

    # 3. Объявления
    ads = _get('/ads.json?fields=id,ad_group_id,name,status,delivery&limit=50', token)

    # 4. Статистика по планам за 30 дней
    plan_ids = []
    if isinstance(plans, dict) and 'items' in plans:
        plan_ids = [str(p['id']) for p in (plans.get('items') or []) if p.get('id')]

    stats_plans = None
    if plan_ids:
        stats_plans = _get(
            f'/statistics/ad_plans/day.json?ids={",".join(plan_ids[:20])}&date_from={date_from}&date_to={date_to}',
            token,
        )

    # 5. Статистика по группам за 30 дней
    group_ids = []
    if isinstance(groups, dict) and 'items' in groups:
        group_ids = [str(g['id']) for g in (groups.get('items') or []) if g.get('id')]

    stats_groups = None
    if group_ids:
        stats_groups = _get(
            f'/statistics/ad_groups/day.json?ids={",".join(group_ids[:20])}&date_from={date_from}&date_to={date_to}',
            token,
        )

    # Агрегаты по статистике планов
    total_impressions = 0
    total_clicks = 0
    total_spent = 0.0
    if isinstance(stats_plans, dict) and 'items' in stats_plans:
        for item in (stats_plans.get('items') or []):
            for r in (item.get('rows') or []):
                base = r.get('base') or {}
                total_impressions += int(base.get('shows', 0) or 0)
                total_clicks += int(base.get('clicks', 0) or 0)
                total_spent += float(base.get('spent', 0) or 0)

    ads_count = 0
    if isinstance(ads, dict) and 'items' in ads:
        ads_count = len(ads.get('items') or [])

    return _ok({
        'ok': True,
        'date_from': date_from,
        'date_to': date_to,
        'summary': {
            'plans_count': len(plan_ids),
            'groups_count': len(group_ids),
            'ads_count': ads_count,
            'total_impressions': total_impressions,
            'total_clicks': total_clicks,
            'total_spent': round(total_spent, 2),
            'ctr': round(total_clicks / total_impressions * 100, 2) if total_impressions > 0 else 0,
        },
        'plans': plans,
        'groups': groups,
        'ads': ads,
        'stats_plans': stats_plans,
        'stats_groups': stats_groups,
    })