"""
VK Ads — полная синхронизация кабинета в БД.
GET /            — читает данные из БД (быстро, без VK API)
GET /?sync=1     — принудительная синхронизация прямо сейчас
GET /?action=cron — крон-режим (автосинхронизация каждые 6 часов)
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
SYNC_INTERVAL_HOURS = 6

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Authorization',
}


def _ok(data: dict) -> dict:
    return {'statusCode': 200, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(data, ensure_ascii=False, default=str)}


def _err(code: int, msg: str) -> dict:
    return {'statusCode': code, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def _vk_get(path: str, token: str):
    url = f'{VK_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


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


def _sync(cur, conn, token: str) -> dict:
    """Синхронизирует все данные VK Ads → БД. Возвращает статистику."""
    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')  # 90 дней истории

    plans_count = groups_count = ads_count = stats_rows = 0

    # ── 1. Планы ────────────────────────────────────────────────────
    plans_data, _ = _vk_get('/ad_plans.json?fields=id,name,status,budget_limit,budget_limit_day,date_start,date_end,objective,delivery&limit=100', token)
    plans = (plans_data or {}).get('items') or []
    for p in plans:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.vk_ads_plans (id, name, status, budget_limit, budget_limit_day, date_start, date_end, objective, delivery, synced_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name=EXCLUDED.name, status=EXCLUDED.status,
                budget_limit=EXCLUDED.budget_limit, budget_limit_day=EXCLUDED.budget_limit_day,
                date_start=EXCLUDED.date_start, date_end=EXCLUDED.date_end,
                objective=EXCLUDED.objective, delivery=EXCLUDED.delivery, synced_at=NOW()
        """, (p.get('id'), p.get('name'), p.get('status'),
              p.get('budget_limit'), p.get('budget_limit_day'),
              p.get('date_start'), p.get('date_end'),
              p.get('objective'), p.get('delivery')))
    plans_count = len(plans)
    plan_ids = [str(p['id']) for p in plans if p.get('id')]

    # ── 2. Группы ───────────────────────────────────────────────────
    groups_data, _ = _vk_get('/ad_groups.json?fields=id,ad_plan_id,name,status,budget_limit,budget_limit_day,delivery&limit=200', token)
    groups = (groups_data or {}).get('items') or []
    for g in groups:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.vk_ads_groups (id, ad_plan_id, name, status, budget_limit, budget_limit_day, delivery, synced_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                ad_plan_id=EXCLUDED.ad_plan_id, name=EXCLUDED.name, status=EXCLUDED.status,
                budget_limit=EXCLUDED.budget_limit, budget_limit_day=EXCLUDED.budget_limit_day,
                delivery=EXCLUDED.delivery, synced_at=NOW()
        """, (g.get('id'), g.get('ad_plan_id'), g.get('name'), g.get('status'),
              g.get('budget_limit'), g.get('budget_limit_day'), g.get('delivery')))
    groups_count = len(groups)
    group_ids = [str(g['id']) for g in groups if g.get('id')]

    # ── 3. Объявления ───────────────────────────────────────────────
    ads_data, _ = _vk_get('/ads.json?fields=id,ad_group_id,name,status,delivery&limit=500', token)
    ads = (ads_data or {}).get('items') or []
    for a in ads:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.vk_ads_items (id, ad_group_id, name, status, delivery, synced_at)
            VALUES (%s,%s,%s,%s,%s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                ad_group_id=EXCLUDED.ad_group_id, name=EXCLUDED.name,
                status=EXCLUDED.status, delivery=EXCLUDED.delivery, synced_at=NOW()
        """, (a.get('id'), a.get('ad_group_id'), a.get('name'), a.get('status'), a.get('delivery')))
    ads_count = len(ads)

    # ── 4. Статистика по планам (90 дней) ──────────────────────────
    if plan_ids:
        stats_data, _ = _vk_get(
            f'/statistics/ad_plans/day.json?ids={",".join(plan_ids[:20])}&date_from={date_from}&date_to={date_to}',
            token,
        )
        for item in ((stats_data or {}).get('items') or []):
            entity_id = item.get('id')
            for row in (item.get('rows') or []):
                base = row.get('base') or {}
                stat_date = row.get('date') or row.get('day')
                if not stat_date or not entity_id:
                    continue
                shows = int(base.get('shows', 0) or 0)
                clicks = int(base.get('clicks', 0) or 0)
                spent = float(base.get('spent', 0) or 0)
                ctr = round(clicks / shows * 100, 2) if shows > 0 else 0
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.vk_ads_stats (entity_type, entity_id, stat_date, shows, clicks, spent, ctr, synced_at)
                    VALUES ('plan', %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (entity_type, entity_id, stat_date) DO UPDATE SET
                        shows=EXCLUDED.shows, clicks=EXCLUDED.clicks,
                        spent=EXCLUDED.spent, ctr=EXCLUDED.ctr, synced_at=NOW()
                """, (entity_id, stat_date, shows, clicks, spent, ctr))
                stats_rows += 1

    # ── 5. Статистика по группам (90 дней) ─────────────────────────
    if group_ids:
        gstats_data, _ = _vk_get(
            f'/statistics/ad_groups/day.json?ids={",".join(group_ids[:20])}&date_from={date_from}&date_to={date_to}',
            token,
        )
        for item in ((gstats_data or {}).get('items') or []):
            entity_id = item.get('id')
            for row in (item.get('rows') or []):
                base = row.get('base') or {}
                stat_date = row.get('date') or row.get('day')
                if not stat_date or not entity_id:
                    continue
                shows = int(base.get('shows', 0) or 0)
                clicks = int(base.get('clicks', 0) or 0)
                spent = float(base.get('spent', 0) or 0)
                ctr = round(clicks / shows * 100, 2) if shows > 0 else 0
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.vk_ads_stats (entity_type, entity_id, stat_date, shows, clicks, spent, ctr, synced_at)
                    VALUES ('group', %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (entity_type, entity_id, stat_date) DO UPDATE SET
                        shows=EXCLUDED.shows, clicks=EXCLUDED.clicks,
                        spent=EXCLUDED.spent, ctr=EXCLUDED.ctr, synced_at=NOW()
                """, (entity_id, stat_date, shows, clicks, spent, ctr))
                stats_rows += 1

    conn.commit()

    # ── 6. Лог синхронизации ────────────────────────────────────────
    cur.execute(f"""
        INSERT INTO {SCHEMA}.vk_ads_sync_log (synced_at, plans_count, groups_count, ads_count, stats_rows)
        VALUES (NOW(), %s, %s, %s, %s)
    """, (plans_count, groups_count, ads_count, stats_rows))
    conn.commit()

    return {'plans_count': plans_count, 'groups_count': groups_count, 'ads_count': ads_count, 'stats_rows': stats_rows}


def _read_from_db(cur) -> dict:
    """Читает все данные из БД и возвращает в формате для фронтенда."""
    # Планы
    cur.execute(f"SELECT * FROM {SCHEMA}.vk_ads_plans ORDER BY id")
    plans = [dict(r) for r in cur.fetchall()]

    # Группы
    cur.execute(f"SELECT * FROM {SCHEMA}.vk_ads_groups ORDER BY ad_plan_id, id")
    groups = [dict(r) for r in cur.fetchall()]

    # Объявления
    cur.execute(f"SELECT * FROM {SCHEMA}.vk_ads_items ORDER BY ad_group_id, id")
    ads = [dict(r) for r in cur.fetchall()]

    # Статистика за последние 30 дней (агрегат по планам)
    cur.execute(f"""
        SELECT entity_id, SUM(shows) AS shows, SUM(clicks) AS clicks, SUM(spent) AS spent
        FROM {SCHEMA}.vk_ads_stats
        WHERE entity_type = 'plan' AND stat_date >= CURRENT_DATE - 30
        GROUP BY entity_id
    """)
    stats_by_plan = {r['entity_id']: dict(r) for r in cur.fetchall()}

    # Статистика по дням за 30 дней (для графика)
    cur.execute(f"""
        SELECT stat_date, SUM(shows) AS shows, SUM(clicks) AS clicks, SUM(spent) AS spent
        FROM {SCHEMA}.vk_ads_stats
        WHERE entity_type = 'plan' AND stat_date >= CURRENT_DATE - 30
        GROUP BY stat_date ORDER BY stat_date
    """)
    stats_by_day = [dict(r) for r in cur.fetchall()]

    # Суммарные показатели за 30 дней
    total_shows = sum(r['shows'] or 0 for r in stats_by_day)
    total_clicks = sum(r['clicks'] or 0 for r in stats_by_day)
    total_spent = float(sum(r['spent'] or 0 for r in stats_by_day))

    # Последняя синхронизация
    cur.execute(f"SELECT * FROM {SCHEMA}.vk_ads_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    return {
        'ok': True,
        'last_sync': last_sync,
        'summary': {
            'plans_count': len(plans),
            'groups_count': len(groups),
            'ads_count': len(ads),
            'total_impressions': total_shows,
            'total_clicks': total_clicks,
            'total_spent': round(total_spent, 2),
            'ctr': round(total_clicks / total_shows * 100, 2) if total_shows > 0 else 0,
        },
        'plans': plans,
        'groups': groups,
        'ads': ads,
        'stats_by_plan': stats_by_plan,
        'stats_by_day': stats_by_day,
    }


def handler(event: dict, context) -> dict:
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Читаем настройки
    cur.execute(f"SELECT vk_ads_client_id, vk_ads_client_secret FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    row = cur.fetchone()
    client_id = (row.get('vk_ads_client_id') or '').strip() if row else ''
    client_secret = (row.get('vk_ads_client_secret') or '').strip() if row else ''

    if not client_id or not client_secret:
        conn.close()
        return _err(400, 'VK Ads не настроен: заполните Client ID и Client Secret в Настройках → Интеграции')

    # ── Крон: синхронизируем каждые SYNC_INTERVAL_HOURS часов ──────
    if action == 'cron' or force_sync:
        if action == 'cron':
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.vk_ads_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < SYNC_INTERVAL_HOURS:
                    conn.close()
                    return _ok({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        token, token_err = _get_token(client_id, client_secret)
        if not token:
            conn.close()
            return _err(401, f'Не удалось получить токен VK Ads: {token_err}')

        result = _sync(cur, conn, token)
        data = _read_from_db(cur)
        conn.close()
        return _ok({**data, 'synced_now': True, 'sync_result': result})

    # ── GET: читаем из БД, при необходимости запускаем первичный синк ──
    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.vk_ads_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        token, token_err = _get_token(client_id, client_secret)
        if not token:
            conn.close()
            return _err(401, f'Не удалось получить токен: {token_err}')
        _sync(cur, conn, token)

    data = _read_from_db(cur)
    conn.close()
    return _ok(data)
