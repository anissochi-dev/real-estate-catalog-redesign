"""
Циан API — синхронизация статистики, баланса и платных услуг в БД.
Сами объекты выгружаются на Циан через XML-фид (backend/xml-feeds), а не через этот API.
Этот API только ЧИТАЕТ данные (статистика, баланс, услуги, звонки) — Циан не даёт
через API управлять ставками/продвижением, это делается только через XML.

GET /                — читает данные из БД (быстро, без Циан API)
GET /?sync=1         — принудительная синхронизация прямо сейчас
GET /?action=cron    — крон-режим (автосинхронизация каждые 6 часов)
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
CIAN_BASE = 'https://public-api.cian.ru'
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


def _cian_get(path: str, token: str):
    url = f'{CIAN_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def _sync(cur, conn, token: str) -> dict:
    """Синхронизирует объявления, статистику, услуги, звонки и баланс Циан → БД."""
    offers_count = stats_count = services_count = calls_count = 0

    # ── 1. Список объявлений (v2/get-my-offers, постранично) ───────────
    all_offers = []
    page = 1
    while True:
        data, err = _cian_get(f'/v2/get-my-offers?page={page}&pageSize=100', token)
        if err or not data:
            break
        result = data.get('result') or {}
        items = result.get('announcements') or []
        all_offers.extend(items)
        total = result.get('totalCount', 0)
        if len(all_offers) >= total or not items:
            break
        page += 1
        if page > 20:  # предохранитель от бесконечного цикла
            break

    for o in all_offers:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_offers (id, status, source, creation_date, synced_at)
            VALUES (%s,%s,%s,%s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                status=EXCLUDED.status, source=EXCLUDED.source,
                creation_date=EXCLUDED.creation_date, synced_at=NOW()
        """, (o.get('id'), o.get('status'), o.get('source'), o.get('creationDate')))
    offers_count = len(all_offers)
    offer_ids = [o['id'] for o in all_offers if o.get('id')]

    # ── 2. Детали объявлений — externalId (наш listing.id) и url ───────
    for batch in _chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-my-offers-detail?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('offers') or []:
            ext_id = item.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                UPDATE {SCHEMA}.cian_offers SET external_id = %s, url = %s WHERE id = %s
            """, (ext_id_int, item.get('url'), item.get('id')))

    # ── 3. Статистика просмотров за всё время (макс. 50 id за раз) ──────
    for batch in _chunks(offer_ids, 50):
        qs = '&'.join(f'offersIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-views-statistics?{qs}', token)
        if err or not data:
            continue
        for s in (data.get('result') or {}).get('statistics') or []:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_offer_stats
                    (offer_id, add_to_favorites, calls, chats, phone_shows, phone_views, phone_views_and_chats, responses, shows_base, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (offer_id) DO UPDATE SET
                    add_to_favorites=EXCLUDED.add_to_favorites, calls=EXCLUDED.calls, chats=EXCLUDED.chats,
                    phone_shows=EXCLUDED.phone_shows, phone_views=EXCLUDED.phone_views,
                    phone_views_and_chats=EXCLUDED.phone_views_and_chats, responses=EXCLUDED.responses,
                    shows_base=EXCLUDED.shows_base, synced_at=NOW()
            """, (
                s.get('offerId'), s.get('addToFavorites', 0), s.get('calls', 0), s.get('chats', 0),
                s.get('phoneShows', 0), s.get('phoneViews', 0), s.get('phoneViewsAndChats', 0),
                s.get('responses', 0), s.get('showsBase', 0),
            ))
            stats_count += 1

    # ── 4. Активные платные услуги (выделение, топ-3, премиум и т.д.) ───
    for batch in _chunks(offer_ids, 50):
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-offer-active-services?{qs}', token)
        if err or not data:
            continue
        for item in (data.get('result') or {}).get('items') or []:
            oid = item.get('offerId')
            for svc in item.get('services') or []:
                for stype in svc.get('serviceTypes') or []:
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.cian_offer_services (offer_id, service_type, price, paid_till, auto_prolong, synced_at)
                        VALUES (%s,%s,%s,%s,%s, NOW())
                        ON CONFLICT (offer_id, service_type) DO UPDATE SET
                            price=EXCLUDED.price, paid_till=EXCLUDED.paid_till,
                            auto_prolong=EXCLUDED.auto_prolong, synced_at=NOW()
                    """, (oid, stype, svc.get('price'), svc.get('paidTill'), svc.get('autoProlongEnabled', False)))
                    services_count += 1

    # ── 5. Звонки за последние 30 дней ──────────────────────────────────
    date_to = datetime.now().strftime('%Y-%m-%d')
    date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    page = 1
    while True:
        data, err = _cian_get(
            f'/v2/get-calls-report?dateFrom={date_from}&dateTo={date_to}&page={page}&pageSize=100', token,
        )
        if err or not data:
            break
        result = data.get('result') or {}
        calls = result.get('calls') or []
        for c in calls:
            offer = c.get('offer') or {}
            ext_id = offer.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_calls
                    (call_id, offer_id, external_id, source_phone, destination_phone, calltracking_phone,
                     duration, status, call_datetime, employee_id, synced_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
                ON CONFLICT (call_id) DO UPDATE SET
                    offer_id=EXCLUDED.offer_id, external_id=EXCLUDED.external_id,
                    source_phone=EXCLUDED.source_phone, destination_phone=EXCLUDED.destination_phone,
                    calltracking_phone=EXCLUDED.calltracking_phone, duration=EXCLUDED.duration,
                    status=EXCLUDED.status, call_datetime=EXCLUDED.call_datetime,
                    employee_id=EXCLUDED.employee_id, synced_at=NOW()
            """, (
                c.get('callId'), offer.get('id'), ext_id_int, c.get('sourcePhone'), c.get('destinationPhone'),
                c.get('calltrackingPhone'), c.get('duration'), c.get('status'), c.get('datetime'), c.get('employeeId'),
            ))
            calls_count += 1
        total = result.get('totalCount', 0)
        if page * 100 >= total or not calls:
            break
        page += 1
        if page > 20:
            break

    # ── 6. Баланс ────────────────────────────────────────────────────────
    bdata, berr = _cian_get('/v1/get-my-balance', token)
    if not berr and bdata:
        bres = bdata.get('result') or {}
        bonuses = sum(float(b.get('amount', 0) or 0) for b in (bres.get('bonuses') or []))
        auction_pts = sum(float(b.get('amount', 0) or 0) for b in (bres.get('auctionPoints') or []))
        cur.execute(f"""
            INSERT INTO {SCHEMA}.cian_balance (total_balance, bonuses_amount, auction_points_amount, synced_at)
            VALUES (%s,%s,%s, NOW())
        """, (bres.get('totalBalance', 0), bonuses, auction_pts))

    conn.commit()

    cur.execute(f"""
        INSERT INTO {SCHEMA}.cian_sync_log (synced_at, offers_count, stats_count, services_count, calls_count)
        VALUES (NOW(), %s, %s, %s, %s)
    """, (offers_count, stats_count, services_count, calls_count))
    conn.commit()

    return {'offers_count': offers_count, 'stats_count': stats_count, 'services_count': services_count, 'calls_count': calls_count}


def _read_from_db(cur) -> dict:
    """Читает все данные из БД и возвращает в формате для фронтенда."""
    cur.execute(f"""
        SELECT o.id, o.external_id, o.status, o.source, o.url, o.creation_date,
               l.title, l.slug, l.category, l.deal, l.price, l.image,
               COALESCE(s.add_to_favorites, 0) AS add_to_favorites,
               COALESCE(s.calls, 0) AS calls,
               COALESCE(s.chats, 0) AS chats,
               COALESCE(s.phone_shows, 0) AS phone_shows,
               COALESCE(s.responses, 0) AS responses,
               COALESCE(s.shows_base, 0) AS views
        FROM {SCHEMA}.cian_offers o
        LEFT JOIN {SCHEMA}.listings l ON l.id = o.external_id
        LEFT JOIN {SCHEMA}.cian_offer_stats s ON s.offer_id = o.id
        ORDER BY o.id DESC
    """)
    offers = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT offer_id, service_type, price, paid_till, auto_prolong FROM {SCHEMA}.cian_offer_services")
    services_by_offer: dict = {}
    service_type_counts: dict = {}
    for r in cur.fetchall():
        d = dict(r)
        services_by_offer.setdefault(d['offer_id'], []).append(d)
        service_type_counts[d['service_type']] = service_type_counts.get(d['service_type'], 0) + 1

    cur.execute(f"""
        SELECT external_id, source_phone, duration, status, call_datetime
        FROM {SCHEMA}.cian_calls
        WHERE external_id IS NOT NULL
        ORDER BY call_datetime DESC
    """)
    calls_by_listing: dict = {}
    for r in cur.fetchall():
        d = dict(r)
        calls_by_listing.setdefault(d['external_id'], []).append(d)

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_balance ORDER BY synced_at DESC LIMIT 1")
    balance = dict(cur.fetchone() or {})

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    published = [o for o in offers if o.get('status') == 'published']
    total_views = sum(o.get('views', 0) for o in offers)
    total_calls = sum(o.get('calls', 0) for o in offers)
    total_favs = sum(o.get('add_to_favorites', 0) for o in offers)

    for o in offers:
        o['services'] = services_by_offer.get(o['id'], [])
        o['calls_list'] = calls_by_listing.get(o.get('external_id'), []) if o.get('external_id') else []

    return {
        'ok': True,
        'last_sync': last_sync,
        'balance': balance,
        'summary': {
            'offers_count': len(offers),
            'published_count': len(published),
            'total_views': total_views,
            'total_calls': total_calls,
            'total_favorites': total_favs,
            'services_by_type': service_type_counts,
        },
        'offers': offers,
    }


def handler(event: dict, context) -> dict:
    """Циан API: читает статистику/баланс/услуги из БД, при sync=1 или cron синхронизирует с Циан API."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(f"SELECT api_key, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not token:
        conn.close()
        return _err(400, 'ЦИАН не настроен: заполните API Token в Настройках → Интеграции → Площадки')

    if action == 'cron' or force_sync:
        if action == 'cron':
            if not is_active:
                conn.close()
                return _ok({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < SYNC_INTERVAL_HOURS:
                    conn.close()
                    return _ok({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _sync(cur, conn, token)
        data = _read_from_db(cur)
        conn.close()
        return _ok({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.cian_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _sync(cur, conn, token)
        data = _read_from_db(cur)
        conn.close()
        return _ok({**data, 'synced_now': True, 'sync_result': result})

    data = _read_from_db(cur)
    conn.close()
    return _ok(data)
