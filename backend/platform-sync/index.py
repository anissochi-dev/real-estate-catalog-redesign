"""
Business: Синхронизация рекламных кабинетов площадок (ЦИАН, Яндекс.Недвижимость, Авито, Юла,
ДомКлик): статистика, баланс, статусы объявлений, публикация на Юле. Вынесено из xml-feeds.
Каждый вызов укладывается в 25 с: автоматический запуск (action=cron) синхронизирует ОДНУ
площадку — ту, что дольше всех не обновлялась.
Args: event с httpMethod GET/POST, queryStringParameters {action, sync}
Returns: JSON
"""

import hashlib
import json
import os
import re
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from psycopg2.extras import execute_values

from feeds_common import (
    SCHEMA, _auth_token, _clean_title, _get_user, _json, _split_images, _total_price,
    busy_response, call_elapsed_ms, db_connect, http_timeout, is_rate_limit, start_call,
)
from feeds_common import budget_exceeded as _over_budget

# На синхронизацию отводится 22 с от начала вызова; остаток — запись результата и ответ.
PLATFORM_WORK_SEC = 22
CRON_LOCK_NAME = 'platform-sync-cron'
CRON_LOCK_TTL_SEC = 60


CIAN_BASE = 'https://public-api.cian.ru'
CIAN_SYNC_INTERVAL_HOURS = 1
YANDEX_REALTY_SYNC_INTERVAL_HOURS = 1
DOMCLICK_STATS_BASE = 'https://public-api.domclick.ru/stats'
DOMCLICK_SYNC_INTERVAL_HOURS = 1


# ── ЦИАН: синхронизация статистики/баланса/услуг через public-api.cian.ru ───
# (объединено из backend/cian-api). Сами объекты выгружаются через XML выше,
# этот блок только ЧИТАЕТ данные кабинета (статистика, баланс, услуги, звонки).

def _cian_get(path, token):
    url = f'{CIAN_BASE}{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(20)) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _cian_chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


CIAN_SYNC_TIME_BUDGET_SEC = 22  # см. комментарий в _cian_sync. У платформы жёсткий


# gateway-таймаут ~30с (меньше, чем function.json timeout=60 — подтверждено на практике
# на этой же функции при синхронизации Юлы) — бюджет должен укладываться в этот лимит
# с запасом на накладные расходы, как уже сделано для Яндекс.CRM (22с).


def _cian_sync(cur, conn, token):
    """Синхронизирует объявления, статистику, услуги, звонки и баланс ЦИАН → БД.

    Тайм-бюджет + commit ПОСЛЕ КАЖДОГО ЭТАПА (offers → detail → views-stats →
    services → calls → balance) — тот же паттерн, что уже используется для
    Яндекс.CRM/ДомКлика/Юлы: раньше был один общий commit() в самом конце всех
    шести последовательных сетевых этапов, а при росте каталога (сейчас батчи
    по 50 id, но с ростом числа объявлений растёт и число батчей на каждом
    этапе) суммарное время рискует превысить лимит функции (60с) — тогда
    результаты ВСЕГО прогона (включая уже полученные offers/detail/stats)
    терялись бы, а не только необработанный остаток."""
    start_ts = time.monotonic()
    offers_count = stats_count = services_count = calls_count = 0

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
        if page > 20:
            break

    # Пакетная запись (один запрос вместо запроса на объявление) — лимит частоты запросов к БД.
    offer_rows = {o.get('id'): (o.get('id'), o.get('status'), o.get('source'), o.get('creationDate'))
                  for o in all_offers if o.get('id')}
    if offer_rows:
        execute_values(cur, f"""
            INSERT INTO {SCHEMA}.cian_offers (id, status, source, creation_date, synced_at, archived_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                status=EXCLUDED.status, source=EXCLUDED.source,
                creation_date=EXCLUDED.creation_date, synced_at=NOW(),
                archived_at=NULL
        """, list(offer_rows.values()), template='(%s,%s,%s,%s, NOW(), NULL)')
    offers_count = len(all_offers)
    offer_ids = [o['id'] for o in all_offers if o.get('id')]

    # Объявления, которых больше нет в ответе ЦИАН (сняты с публикации, ушли в архив на
    # стороне ЦИАН, удалены вручную и т.п.) — НЕ удаляем, а помечаем как архивные, сохраняя
    # всю историю просмотров/звонков/услуг. Так они не засоряют активный дашборд, но
    # статистика по ним не теряется — их можно посмотреть во вкладке «Архив».
    # Защита: если API вернул пустой список (сбой/ошибка авторизации), ничего не трогаем.
    if offer_ids:
        keep_ids_sql = ','.join(str(oid) for oid in offer_ids)
        cur.execute(f"""
            UPDATE {SCHEMA}.cian_offers SET archived_at = NOW()
            WHERE id NOT IN ({keep_ids_sql}) AND archived_at IS NULL
        """)
    conn.commit()  # этап 1 (offers) сохранён

    for batch in _cian_chunks(offer_ids, 50):
        if _over_budget(start_ts, CIAN_SYNC_TIME_BUDGET_SEC):
            break
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-my-offers-detail?{qs}', token)
        if err or not data:
            continue
        detail_rows = []
        for item in (data.get('result') or {}).get('offers') or []:
            ext_id = item.get('externalId')
            try:
                ext_id_int = int(ext_id) if ext_id else None
            except (ValueError, TypeError):
                ext_id_int = None
            if item.get('id') is not None:
                detail_rows.append((item.get('id'), ext_id_int, item.get('url')))
        if detail_rows:
            execute_values(cur, f"""
                UPDATE {SCHEMA}.cian_offers AS t SET external_id = v.external_id::bigint, url = v.url
                FROM (VALUES %s) AS v(id, external_id, url)
                WHERE t.id = v.id::bigint
            """, detail_rows)
        conn.commit()  # этап 2 (detail) — сохраняем по мере обработки батчей

    for batch in _cian_chunks(offer_ids, 50):
        if _over_budget(start_ts, CIAN_SYNC_TIME_BUDGET_SEC):
            break
        qs = '&'.join(f'offersIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-views-statistics?{qs}', token)
        if err or not data:
            continue
        stat_rows = {}
        for s in (data.get('result') or {}).get('statistics') or []:
            if s.get('offerId') is None:
                continue
            stat_rows[s.get('offerId')] = (
                s.get('offerId'), s.get('addToFavorites', 0), s.get('calls', 0), s.get('chats', 0),
                s.get('phoneShows', 0), s.get('phoneViews', 0), s.get('phoneViewsAndChats', 0),
                s.get('responses', 0), s.get('showsBase', 0),
            )
        if stat_rows:
            execute_values(cur, f"""
                INSERT INTO {SCHEMA}.cian_offer_stats
                    (offer_id, add_to_favorites, calls, chats, phone_shows, phone_views, phone_views_and_chats, responses, shows_base, synced_at)
                VALUES %s
                ON CONFLICT (offer_id) DO UPDATE SET
                    add_to_favorites=EXCLUDED.add_to_favorites, calls=EXCLUDED.calls, chats=EXCLUDED.chats,
                    phone_shows=EXCLUDED.phone_shows, phone_views=EXCLUDED.phone_views,
                    phone_views_and_chats=EXCLUDED.phone_views_and_chats, responses=EXCLUDED.responses,
                    shows_base=EXCLUDED.shows_base, synced_at=NOW()
            """, list(stat_rows.values()), template='(%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())')
            stats_count += len(stat_rows)
        conn.commit()  # этап 3 (views-stats) — сохраняем по мере обработки батчей

    for batch in _cian_chunks(offer_ids, 50):
        if _over_budget(start_ts, CIAN_SYNC_TIME_BUDGET_SEC):
            break
        qs = '&'.join(f'offerIds={oid}' for oid in batch)
        data, err = _cian_get(f'/v1/get-offer-active-services?{qs}', token)
        if err or not data:
            continue
        svc_rows = {}
        for item in (data.get('result') or {}).get('items') or []:
            oid = item.get('offerId')
            for svc in item.get('services') or []:
                for stype in svc.get('serviceTypes') or []:
                    svc_rows[(oid, stype)] = (oid, stype, svc.get('price'), svc.get('paidTill'), svc.get('autoProlongEnabled', False))
        if svc_rows:
            execute_values(cur, f"""
                INSERT INTO {SCHEMA}.cian_offer_services (offer_id, service_type, price, paid_till, auto_prolong, synced_at)
                VALUES %s
                ON CONFLICT (offer_id, service_type) DO UPDATE SET
                    price=EXCLUDED.price, paid_till=EXCLUDED.paid_till,
                    auto_prolong=EXCLUDED.auto_prolong, synced_at=NOW()
            """, list(svc_rows.values()), template='(%s,%s,%s,%s,%s, NOW())')
            services_count += len(svc_rows)
        conn.commit()  # этап 4 (services) — сохраняем по мере обработки батчей

    budget_exceeded = _over_budget(start_ts, CIAN_SYNC_TIME_BUDGET_SEC)
    if not budget_exceeded:
        date_to = datetime.now().strftime('%Y-%m-%d')
        date_from = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        page = 1
        while True:
            if _over_budget(start_ts, CIAN_SYNC_TIME_BUDGET_SEC):
                budget_exceeded = True
                break
            data, err = _cian_get(
                f'/v2/get-calls-report?dateFrom={date_from}&dateTo={date_to}&page={page}&pageSize=100', token,
            )
            if err or not data:
                break
            result = data.get('result') or {}
            calls = result.get('calls') or []
            call_rows = {}
            for c in calls:
                offer = c.get('offer') or {}
                ext_id = offer.get('externalId')
                try:
                    ext_id_int = int(ext_id) if ext_id else None
                except (ValueError, TypeError):
                    ext_id_int = None
                if c.get('callId') is None:
                    continue
                call_rows[c.get('callId')] = (
                    c.get('callId'), offer.get('id'), ext_id_int, c.get('sourcePhone'), c.get('destinationPhone'),
                    c.get('calltrackingPhone'), c.get('duration'), c.get('status'), c.get('datetime'), c.get('employeeId'),
                )
            if call_rows:
                execute_values(cur, f"""
                    INSERT INTO {SCHEMA}.cian_calls
                        (call_id, offer_id, external_id, source_phone, destination_phone, calltracking_phone,
                         duration, status, call_datetime, employee_id, synced_at)
                    VALUES %s
                    ON CONFLICT (call_id) DO UPDATE SET
                        offer_id=EXCLUDED.offer_id, external_id=EXCLUDED.external_id,
                        source_phone=EXCLUDED.source_phone, destination_phone=EXCLUDED.destination_phone,
                        calltracking_phone=EXCLUDED.calltracking_phone, duration=EXCLUDED.duration,
                        status=EXCLUDED.status, call_datetime=EXCLUDED.call_datetime,
                        employee_id=EXCLUDED.employee_id, synced_at=NOW()
                """, list(call_rows.values()), template='(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())')
                calls_count += len(call_rows)
            conn.commit()  # этап 5 (calls) — сохраняем по мере обработки страниц
            total = result.get('totalCount', 0)
            if page * 100 >= total or not calls:
                break
            page += 1
            if page > 20:
                break

    if not budget_exceeded:
        bdata, berr = _cian_get('/v1/get-my-balance', token)
        if not berr and bdata:
            bres = bdata.get('result') or {}
            bonuses = sum(float(b.get('amount', 0) or 0) for b in (bres.get('bonuses') or []))
            auction_pts = sum(float(b.get('amount', 0) or 0) for b in (bres.get('auctionPoints') or []))
            cur.execute(f"""
                INSERT INTO {SCHEMA}.cian_balance (total_balance, bonuses_amount, auction_points_amount, synced_at)
                VALUES (%s,%s,%s, NOW())
            """, (bres.get('totalBalance', 0), bonuses, auction_pts))
            conn.commit()  # этап 6 (balance)

    cur.execute(f"""
        INSERT INTO {SCHEMA}.cian_sync_log (synced_at, offers_count, stats_count, services_count, calls_count)
        VALUES (NOW(), %s, %s, %s, %s)
    """, (offers_count, stats_count, services_count, calls_count))
    conn.commit()

    return {
        'offers_count': offers_count, 'stats_count': stats_count, 'services_count': services_count,
        'calls_count': calls_count, 'budget_exceeded': budget_exceeded,
    }


def _cian_read_from_db(cur):
    """Читает все данные кабинета ЦИАН из БД и возвращает в формате для фронтенда.
    Объявления делятся на активные (archived_at IS NULL) и архивные — история
    просмотров/звонков/услуг сохраняется по обеим группам."""
    cur.execute(f"""
        SELECT o.id, o.external_id, o.status, o.source, o.url, o.creation_date, o.archived_at,
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
    all_offers = [dict(r) for r in cur.fetchall()]

    cur.execute(f"SELECT offer_id, service_type, price, paid_till, auto_prolong FROM {SCHEMA}.cian_offer_services")
    services_by_offer = {}
    service_type_counts = {}
    for r in cur.fetchall():
        d = dict(r)
        services_by_offer.setdefault(d['offer_id'], []).append(d)
        service_type_counts[d['service_type']] = service_type_counts.get(d['service_type'], 0) + 1

    cur.execute(f"""
        SELECT offer_id, external_id, source_phone, duration, status, call_datetime
        FROM {SCHEMA}.cian_calls
        ORDER BY call_datetime DESC
    """)
    calls_by_offer = {}
    for r in cur.fetchall():
        d = dict(r)
        calls_by_offer.setdefault(d['offer_id'], []).append(d)

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_balance ORDER BY synced_at DESC LIMIT 1")
    balance = dict(cur.fetchone() or {})

    cur.execute(f"SELECT * FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_sync = dict(cur.fetchone() or {})

    for o in all_offers:
        o['services'] = services_by_offer.get(o['id'], [])
        o['calls_list'] = calls_by_offer.get(o['id'], [])

    offers = [o for o in all_offers if not o.get('archived_at')]
    archived_offers = [o for o in all_offers if o.get('archived_at')]

    published = [o for o in offers if o.get('status') == 'published']
    total_views = sum(o.get('views', 0) for o in offers)
    total_calls = sum(o.get('calls', 0) for o in offers)
    total_favs = sum(o.get('add_to_favorites', 0) for o in offers)

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
            'archived_count': len(archived_offers),
        },
        'offers': offers,
        'archived_offers': archived_offers,
    }


def _cian_handle(cur, conn, params):
    """Обрабатывает action=cian_stats|cian_sync|cian_cron: читает/синхронизирует кабинет ЦИАН."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'cian' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not token:
        return _json({'error': 'ЦИАН не настроен: заполните API Token в Настройках → Интеграции → Площадки'}, 400)

    if action == 'cian_cron' or force_sync:
        if action == 'cian_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.cian_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < CIAN_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.cian_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _cian_sync(cur, conn, token)
        data = _cian_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_cian_read_from_db(cur))


# ── Яндекс.Недвижимость: статистика через официальный CRM API ───────────────
# https://api.realty.yandex.net/2.0/crm — статистика по фиду и объявлениям,
# доступна по обычному OAuth-токену БЕЗ привязки к рекламному кабинету
# (в отличие от прежнего publicPartner/calls, который требовал недоступный
# грант OnCustomer на клиентский аккаунт Директа — оттуда были 120 подряд
# неудачных синхронизаций с 403 FORBIDDEN).
# Авторизация — два фиксированных заголовка на каждый запрос:
#   Authorization: OAuth <токен из ad_platform_keys.api_key>
#   X-Authorization: Vertis crm-dff153a8ef1a90d3bff5ee378dee416606cf8915 (константа API, одна для всех)

YANDEX_CRM_API_BASE = 'https://api.realty.yandex.net/2.0/crm'


YANDEX_CRM_X_AUTH = 'Vertis crm-dff153a8ef1a90d3bff5ee378dee416606cf8915'


def _yandex_crm_get(path, oauth_token, params=None):
    """GET-запрос к CRM API Яндекс.Недвижимости."""
    url = f'{YANDEX_CRM_API_BASE}{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={
        'accept': 'application/json',
        'Authorization': f'OAuth {oauth_token}',
        'X-Authorization': YANDEX_CRM_X_AUTH,
    })
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(20)) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()[:300]
        except Exception:
            body = ''
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _yandex_crm_find_feed_id(oauth_token, our_feed_url):
    """Находит id нашего фида на стороне Яндекса (GET /crm/feeds) по совпадению
    URL — этот id внутренний для Яндекса и не совпадает с нашим xml_feeds.id,
    поэтому ищем каждый раз заново, а не храним статично (на случай если
    Яндекс пересоздаст фид при смене URL)."""
    data, err = _yandex_crm_get('/feeds', oauth_token)
    if err:
        return None, err
    feeds = (data or {}).get('feeds') or []
    for f in feeds:
        if f.get('url') == our_feed_url and f.get('status') != 'DELETED':
            return f.get('id'), None
    return None, 'Наш фид (yandex.xml) не найден в списке фидов Яндекса — проверьте, что он подключён в личном кабинете Яндекс.Недвижимости'


def _yandex_crm_fetch_offer_stats(args):
    """Один запрос статистики по объявлению (GET /offer/{offerId}/stats).
    Яндекс троттлит эти запросы примерно до 1/сек — параллелизация не помогает,
    поэтому вызывается последовательно с бюджетом времени в _yandex_crm_sync."""
    offer_id, oauth_token, date_from, date_to = args
    stats_data, stats_err = _yandex_crm_get(f'/offer/{offer_id}/stats', oauth_token, {
        'startTime': date_from.strftime('%Y-%m-%dT%H:%M:%S+00:00'),
        'endTime': date_to.strftime('%Y-%m-%dT%H:%M:%S+00:00'),
    })
    if stats_err:
        return offer_id, None
    daily = ((stats_data or {}).get('stats') or {}).get('daily') or []
    return offer_id, daily


def _yandex_crm_sync(cur, conn, oauth_token, our_feed_url):
    """Синхронизирует статус фида, статус каждого объявления и дневную
    статистику (показы/звонки) за последние 30 дней через CRM API → БД.
    Статусы объявлений сохраняются и коммитятся СРАЗУ (быстрый, надёжный шаг) —
    даже если следующий шаг (статистика по дням) не уложится в таймаут, состояние
    индексации фида и список объявлений в БД уже не потеряются."""
    feed_id, err = _yandex_crm_find_feed_id(oauth_token, our_feed_url)
    if err:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count, error)
            VALUES (NOW(), 0, %s)
        """, (err[:500],))
        conn.commit()
        return {'error': err}

    # Состояние индексации фида: всего/принято/отклонено объявлений
    state_data, state_err = _yandex_crm_get(f'/feed/{feed_id}/state', oauth_token)
    state = (state_data or {}).get('state') or {}

    # Список объявлений фида (постранично, до 100 за раз) → сопоставление по internalId
    offers = []
    offset = 0
    while True:
        page, page_err = _yandex_crm_get('/offers', oauth_token, {'feedId': feed_id, 'offset': offset, 'limit': 100})
        if page_err:
            break
        snippets = ((page or {}).get('listing') or {}).get('snippets') or []
        offers.extend(s['offer'] for s in snippets if s.get('offer'))
        total = (((page or {}).get('listing') or {}).get('slicing') or {}).get('total', 0)
        offset += 100
        if offset >= total or not snippets:
            break

    # Шаг 1: статусы объявлений — быстро, сохраняем и коммитим сразу.
    offer_to_listing = {}
    status_rows = {}
    for o in offers:
        internal_id = o.get('internalId')
        listing_id = None
        if internal_id:
            try:
                listing_id = int(internal_id)
            except (TypeError, ValueError):
                listing_id = None
        offer_id = o.get('id')
        error_type = None
        errors = ((o.get('state') or {}).get('errors')) or []
        if errors:
            error_type = errors[0].get('type')

        if not listing_id or not offer_id:
            continue
        offer_to_listing[offer_id] = listing_id
        status_rows[listing_id] = (listing_id, offer_id, o.get('url'), o.get('createTime'), error_type)

    # Одним пакетным запросом, а не по запросу на объявление: у БД платформы есть
    # лимит частоты запросов («rate limit exceeded»), и сотни одиночных INSERT подряд
    # его пробивали — синхронизация Яндекса падала на середине.
    if status_rows:
        execute_values(cur, f"""
            INSERT INTO {SCHEMA}.yandex_offer_status (listing_id, yandex_offer_id, yandex_url, create_time, error_type, checked_at)
            VALUES %s
            ON CONFLICT (listing_id) DO UPDATE SET
                yandex_offer_id=EXCLUDED.yandex_offer_id, yandex_url=EXCLUDED.yandex_url,
                create_time=EXCLUDED.create_time, error_type=EXCLUDED.error_type, checked_at=NOW()
        """, list(status_rows.values()), template='(%s,%s,%s,%s,%s, NOW())')
    conn.commit()
    print(f'[yandex_crm] step 1 done, offer_to_listing count={len(offer_to_listing)}')

    # Шаг 2: статистика по дням. Яндекс троттлит запросы к /offer/{id}/stats
    # примерно до 1 в секунду СО СТОРОНЫ САМОГО API — независимо от того, сколько
    # параллельных потоков открываем мы (проверено: max_workers=10 не ускоряет).
    # А у платформы жёсткий gateway-таймаут 30с (меньше, чем наш function.json
    # timeout=60) — значит за один вызов крона нельзя гарантированно успеть более
    # ~25 объявлений. Решение: обрабатываем с ограничением по времени (бюджет),
    # коммитим В БД ПОСЛЕ КАЖДОГО объявления (не одним большим commit в конце) —
    # если бюджет исчерпан, недообработанные объявления просто подтянутся на
    # следующем тике крона (раз в 20 минут), прогресс уже сохранённых не теряется.
    SYNC_TIME_BUDGET_SEC = 22
    start_ts = time.monotonic()
    date_to = datetime.now()
    date_from = date_to - timedelta(days=30)
    stats_synced = 0
    offers_processed = 0
    offers_skipped_budget = 0
    for offer_id, listing_id in offer_to_listing.items():
        if _over_budget(start_ts, SYNC_TIME_BUDGET_SEC):
            offers_skipped_budget += 1
            continue
        _, daily = _yandex_crm_fetch_offer_stats((offer_id, oauth_token, date_from, date_to))
        offers_processed += 1
        if not daily:
            continue
        day_rows = {}
        for d in daily:
            try:
                stat_date = datetime.strptime(d['day'], '%d-%m-%Y').date()
            except (KeyError, ValueError):
                continue
            day_rows[stat_date] = (listing_id, offer_id, stat_date, d.get('shows', 0), d.get('cardShows', 0), d.get('phoneShows', 0), d.get('calls', 0))
        if not day_rows:
            continue
        # Все дни объявления — одним запросом (раньше 30 запросов на объявление).
        execute_values(cur, f"""
            INSERT INTO {SCHEMA}.yandex_offer_stats (listing_id, yandex_offer_id, stat_date, shows, card_shows, phone_shows, calls, synced_at)
            VALUES %s
            ON CONFLICT (yandex_offer_id, stat_date) DO UPDATE SET
                shows=EXCLUDED.shows, card_shows=EXCLUDED.card_shows,
                phone_shows=EXCLUDED.phone_shows, calls=EXCLUDED.calls, synced_at=NOW()
        """, list(day_rows.values()), template='(%s,%s,%s,%s,%s,%s,%s, NOW())')
        stats_synced += len(day_rows)
        conn.commit()
    print(f'[yandex_crm] step 2 done: processed={offers_processed} skipped_budget={offers_skipped_budget} stats_synced={stats_synced}')

    cur.execute(f"""
        INSERT INTO {SCHEMA}.yandex_sync_log (synced_at, calls_count, yandex_feed_id, offers_total, offers_accepted, offers_declined)
        VALUES (NOW(), %s, %s, %s, %s, %s)
    """, (stats_synced, feed_id, state.get('total'), state.get('accepted'), state.get('declined')))
    conn.commit()

    return {
        'feed_id': feed_id,
        'offers_total': state.get('total'),
        'offers_accepted': state.get('accepted'),
        'offers_declined': state.get('declined'),
        'offers_synced': len(offers),
        'stats_days_synced': stats_synced,
    }


def _yandex_crm_read_from_db(cur):
    """Читает статистику Яндекс.Недвижимости из БД для фронтенда: сводку за
    30 дней по каждому объекту + статус индексации фида."""
    cur.execute(f"""
        SELECT s.listing_id, s.yandex_offer_id, s.yandex_url, s.create_time, s.error_type, s.checked_at,
               l.title, l.slug, l.category, l.deal, l.price, l.image,
               COALESCE(SUM(st.shows), 0) AS shows, COALESCE(SUM(st.card_shows), 0) AS card_shows,
               COALESCE(SUM(st.phone_shows), 0) AS phone_shows, COALESCE(SUM(st.calls), 0) AS calls
        FROM {SCHEMA}.yandex_offer_status s
        LEFT JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        LEFT JOIN {SCHEMA}.yandex_offer_stats st ON st.listing_id = s.listing_id AND st.stat_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY s.listing_id, s.yandex_offer_id, s.yandex_url, s.create_time, s.error_type, s.checked_at,
                 l.title, l.slug, l.category, l.deal, l.price, l.image
        ORDER BY shows DESC
    """)
    offers = []
    for r in cur.fetchall():
        d = dict(r)
        for k in ('create_time', 'checked_at'):
            if d.get(k):
                d[k] = d[k].isoformat()
        offers.append(d)

    cur.execute(f"SELECT * FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
    last_row = cur.fetchone()
    last_sync = dict(last_row) if last_row else {}
    if last_sync.get('synced_at'):
        last_sync['synced_at'] = last_sync['synced_at'].isoformat()

    total_shows = sum(o.get('shows') or 0 for o in offers)
    total_calls = sum(o.get('calls') or 0 for o in offers)
    with_errors = len([o for o in offers if o.get('error_type')])

    return {
        'ok': True,
        'last_sync': last_sync,
        'summary': {
            'total_shows': total_shows,
            'total_calls': total_calls,
            'unique_objects': len(offers),
            'with_errors': with_errors,
        },
        'offers': offers,
    }


def _yandex_calls_handle(cur, conn, params):
    """Обрабатывает action=yandex_stats|yandex_cron: читает/синхронизирует статистику
    Яндекс.Недвижимости через официальный CRM API (фид + объявления + показы/звонки)."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'yandex_realty' LIMIT 1")
    row = cur.fetchone()
    oauth_token = (row.get('api_key') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not oauth_token:
        return _json({'error': 'Яндекс.Недвижимость не настроена: заполните OAuth Token в Настройках → Интеграции → Площадки'}, 400)

    cur.execute(f"SELECT cdn_url FROM {SCHEMA}.xml_feeds WHERE slug = 'yandex' LIMIT 1")
    feed_row = cur.fetchone()
    our_feed_url = (feed_row.get('cdn_url') or '') if feed_row else ''
    if not our_feed_url:
        return _json({'error': 'Фид yandex.xml не найден в разделе XML фиды'}, 400)

    if action == 'yandex_cron' or force_sync:
        if action == 'yandex_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.yandex_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < YANDEX_REALTY_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        result = _yandex_crm_sync(cur, conn, oauth_token, our_feed_url)
        data = _yandex_crm_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.yandex_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        result = _yandex_crm_sync(cur, conn, oauth_token, our_feed_url)
        data = _yandex_crm_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': result})

    return _json(_yandex_crm_read_from_db(cur))


# ── Авито: проверка подключения + баланс кошелька через api.avito.ru ────────
# Этап 1: только авторизация (OAuth client_credentials) и чтение баланса —
# без синхронизации объявлений (публикация объектов остаётся через XML-фид).

AVITO_BASE = 'https://api.avito.ru'


AVITO_SYNC_INTERVAL_HOURS = 1


def _avito_get_token(client_id, client_secret):
    """Получает OAuth-токен Авито (grant_type=client_credentials, живёт 24 часа)."""
    body = urllib.parse.urlencode({
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
    }).encode()
    req = urllib.request.Request(
        f'{AVITO_BASE}/token/', data=body, method='POST',
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(20)) as r:
            data = json.loads(r.read().decode())
            return data.get('access_token'), None
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode()[:300]
        except Exception:
            err_body = ''
        return None, f'HTTP {e.code}: {err_body}'
    except Exception as e:
        return None, str(e)


def _avito_get(path, token):
    req = urllib.request.Request(f'{AVITO_BASE}{path}', headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(20)) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _avito_post(path, token, payload):
    """POST-запрос к Авито API (используется для статистики по объявлениям)."""
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{AVITO_BASE}{path}', data=data, method='POST',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(25)) as r:
            return json.loads(r.read().decode()), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {}
        return None, f'HTTP {e.code}: {body}'
    except Exception as e:
        return None, str(e)


def _avito_sync(cur, conn, client_id, client_secret):
    """Проверяет ключи Авито: получает токен, данные аккаунта и баланс кошелька → БД."""
    token, err = _avito_get_token(client_id, client_secret)
    if err or not token:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_sync_log (synced_at, error)
            VALUES (NOW(), %s)
        """, (err[:500] if err else 'Не удалось получить токен',))
        conn.commit()
        return {'error': err or 'Не удалось получить токен'}

    account, acc_err = _avito_get('/core/v1/accounts/self', token)
    if acc_err or not account:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_sync_log (synced_at, error)
            VALUES (NOW(), %s)
        """, (acc_err[:500] if acc_err else 'Не удалось получить данные аккаунта',))
        conn.commit()
        return {'error': acc_err or 'Не удалось получить данные аккаунта'}

    account_id = account.get('id')
    account_name = account.get('name') or account.get('email') or ''

    balance_real = None
    balance_bonus = None
    balance_data = None
    if account_id:
        balance_data, bal_err = _avito_get(f'/core/v1/accounts/{account_id}/balance/', token)
        if balance_data and not bal_err:
            balance_real = balance_data.get('real')
            balance_bonus = balance_data.get('bonus')

    cur.execute(f"""
        INSERT INTO {SCHEMA}.avito_sync_log
            (synced_at, account_id, account_name, balance_real, balance_bonus, raw_response)
        VALUES (NOW(), %s, %s, %s, %s, %s)
    """, (account_id, account_name, balance_real, balance_bonus,
          json.dumps({'account': account, 'balance': balance_data})))
    conn.commit()

    return {
        'account_id': account_id,
        'account_name': account_name,
        'balance_real': balance_real,
        'balance_bonus': balance_bonus,
    }


# ── Авито: отчёт по автозагрузке (фиду) ──────────────────────────────────────
# GET /autoload/v3/reports/last_completed_report — сводка по последнему завершённому
# циклу обработки XML-фида (без user_id в пути — определяется по токену).
# GET /autoload/v2/reports/items?query=id1,id2,... — статус конкретных объявлений
# по их Id из фида (ad_id = наш listing.id), до 100 штук за запрос.

AVITO_STATUS_LABELS = {
    'active': 'Активно на Авито',
    'old': 'Истёк срок размещения',
    'blocked': 'Заблокировано',
    'rejected': 'Отклонено (нарушения)',
    'archived': 'В архиве',
    'removed': 'Удалено навсегда',
}


AVITO_REPORT_STATUS_LABELS = {
    'processing': 'Обрабатывается',
    'success': 'Загружено без ошибок',
    'success_warning': 'Загружено, есть замечания',
    'error': 'Загрузка не удалась',
}


def _avito_fetch_report(cur, conn, token):
    """Запрашивает сводный отчёт последней автозагрузки (v3) и статусы объявлений,
    выгружаемых на Авито (v2 reports/items, по спискам Id из нашей БД, максимум 100
    за запрос) — сохраняет всё в avito_report_log + avito_item_status."""
    summary, err = _avito_get('/autoload/v3/reports/last_completed_report', token)
    if err:
        cur.execute(f"""
            INSERT INTO {SCHEMA}.avito_report_log (fetched_at, error)
            VALUES (NOW(), %s)
        """, (err[:500],))
        conn.commit()
        return {'error': err}

    section_stats = (summary or {}).get('section_stats') or {}
    events = (summary or {}).get('events') or []
    cur.execute(f"""
        INSERT INTO {SCHEMA}.avito_report_log
            (fetched_at, report_status, started_at, finished_at, total_ads, messages)
        VALUES (NOW(), %s, %s, %s, %s, %s)
    """, (
        (summary or {}).get('status'), (summary or {}).get('started_at'), (summary or {}).get('finished_at'),
        section_stats.get('count'), json.dumps({'section_stats': section_stats, 'events': events}, default=str),
    ))
    conn.commit()

    cur.execute(f"SELECT id FROM {SCHEMA}.listings WHERE export_avito = TRUE AND status = 'active'")
    listing_ids = [r['id'] for r in cur.fetchall()]
    if not listing_ids:
        return {
            'status': (summary or {}).get('status'), 'total_ads': section_stats.get('count'),
            'items_checked': 0,
        }

    checked = 0
    for i in range(0, len(listing_ids), 100):
        batch = listing_ids[i:i + 100]
        query = ','.join(str(x) for x in batch)
        data, ierr = _avito_get(f'/autoload/v2/reports/items?query={urllib.parse.quote(query)}', token)
        if ierr or not data:
            continue
        status_rows = {}
        id_rows = {}
        for item in (data.get('items') or []):
            ad_id = item.get('ad_id')
            if not ad_id or not str(ad_id).isdigit():
                continue
            msgs = item.get('messages') or []
            msg_text = '; '.join(m.get('description', '') for m in msgs if m.get('description'))
            section = item.get('section') or {}
            status_rows[int(ad_id)] = (int(ad_id), item.get('avito_id'), item.get('url'),
                                       item.get('avito_status'), section.get('title'), msg_text or None)
            # Обратная синхронизация: пишем реальный номер объявления с Авито
            # в карточку объекта (listings.avito_ad_id), чтобы при следующей
            # выгрузке фида тег <AvitoId> обновлял то же объявление, а не создавал
            # дубликат. avito_id из отчёта — источник истины, перезаписываем всегда.
            real_avito_id = item.get('avito_id')
            if real_avito_id and str(real_avito_id).isdigit():
                id_rows[int(ad_id)] = (int(ad_id), int(real_avito_id))
        # Пакетом на всю страницу (до 100 объектов) — два запроса вместо 200.
        if status_rows:
            execute_values(cur, f"""
                INSERT INTO {SCHEMA}.avito_item_status
                    (listing_id, avito_id, url, status, status_detail, status_message, checked_at)
                VALUES %s
                ON CONFLICT (listing_id) DO UPDATE SET
                    avito_id = EXCLUDED.avito_id, url = EXCLUDED.url,
                    status = EXCLUDED.status, status_detail = EXCLUDED.status_detail,
                    status_message = EXCLUDED.status_message, checked_at = NOW()
            """, list(status_rows.values()), template='(%s,%s,%s,%s,%s,%s, NOW())')
            checked += len(status_rows)
        if id_rows:
            execute_values(cur, f"""
                UPDATE {SCHEMA}.listings AS l SET avito_ad_id = v.avito_id::bigint
                FROM (VALUES %s) AS v(id, avito_id)
                WHERE l.id = v.id::int AND l.avito_ad_id IS DISTINCT FROM v.avito_id::bigint
            """, list(id_rows.values()))
    conn.commit()

    return {
        'status': (summary or {}).get('status'), 'total_ads': section_stats.get('count'),
        'items_checked': checked,
    }


def _avito_fetch_stats(cur, conn, token, account_id):
    """Запрашивает статистику просмотров/контактов по всем объявлениям, у которых есть
    avito_id (из avito_item_status), за последние 30 дней, и обновляет счётчики."""
    cur.execute(f"SELECT listing_id, avito_id FROM {SCHEMA}.avito_item_status WHERE avito_id IS NOT NULL")
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        return {'skipped': True, 'reason': 'Нет объявлений с avito_id — сначала выполните fetch_report'}

    id_to_listing = {int(r['avito_id']): r['listing_id'] for r in rows}
    item_ids = list(id_to_listing.keys())[:200]  # лимит API — не более 200 за раз

    date_to = datetime.now(timezone.utc).date()
    date_from = date_to - timedelta(days=30)
    payload = {
        'dateFrom': date_from.isoformat(),
        'dateTo': date_to.isoformat(),
        'itemIds': item_ids,
        'fields': ['uniqViews', 'uniqContacts', 'uniqFavorites'],
        'periodGrouping': 'month',
    }
    data, err = _avito_post(f'/stats/v1/accounts/{account_id}/items', token, payload)
    if err or not data:
        return {'error': err or 'Пустой ответ'}

    result_items = ((data.get('result') or {}).get('items')) or []
    stat_rows = {}
    for item in result_items:
        avito_id = item.get('itemId') or item.get('item_id')
        listing_id = id_to_listing.get(int(avito_id)) if avito_id else None
        if not listing_id:
            continue
        stats_list = item.get('stats') or []
        views = sum(int(s.get('uniqViews') or s.get('uniq_views') or 0) for s in stats_list)
        contacts = sum(int(s.get('uniqContacts') or s.get('uniq_contacts') or 0) for s in stats_list)
        favorites = sum(int(s.get('uniqFavorites') or s.get('uniq_favorites') or 0) for s in stats_list)
        stat_rows[listing_id] = (listing_id, views, contacts, favorites)
    if stat_rows:
        execute_values(cur, f"""
            UPDATE {SCHEMA}.avito_item_status AS t
            SET uniq_views = v.views::int, uniq_contacts = v.contacts::int, uniq_favorites = v.favorites::int
            FROM (VALUES %s) AS v(listing_id, views, contacts, favorites)
            WHERE t.listing_id = v.listing_id::int
        """, list(stat_rows.values()))
    updated = len(stat_rows)
    conn.commit()
    return {'updated': updated, 'requested': len(item_ids)}


def _avito_read_from_db(cur):
    """Читает последнюю проверку подключения Авито + последний отчёт автозагрузки +
    статусы/статистику по объявлениям из БД для фронтенда."""
    cur.execute(f"SELECT * FROM {SCHEMA}.avito_sync_log ORDER BY synced_at DESC LIMIT 1")
    last = cur.fetchone()
    if not last:
        return {'ok': True, 'connected': False, 'last_sync': None, 'last_report': None, 'items': []}
    last = dict(last)
    last['synced_at'] = last['synced_at'].isoformat() if last.get('synced_at') else None
    last.pop('raw_response', None)

    cur.execute(f"SELECT * FROM {SCHEMA}.avito_report_log ORDER BY fetched_at DESC LIMIT 1")
    report = cur.fetchone()
    if report:
        report = dict(report)
        report['fetched_at'] = report['fetched_at'].isoformat() if report.get('fetched_at') else None
        report['started_at'] = report['started_at'].isoformat() if report.get('started_at') else None
        report['finished_at'] = report['finished_at'].isoformat() if report.get('finished_at') else None
        report['status_label'] = AVITO_REPORT_STATUS_LABELS.get(report.get('report_status'), report.get('report_status'))

    cur.execute(f"""
        SELECT s.listing_id, s.avito_id, s.url, s.status, s.status_detail, s.status_message,
               s.uniq_views, s.uniq_contacts, s.uniq_favorites, s.checked_at,
               l.title, l.city, l.category, l.deal
        FROM {SCHEMA}.avito_item_status s
        JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        ORDER BY s.checked_at DESC
    """)
    items = []
    for r in cur.fetchall():
        d = dict(r)
        d['checked_at'] = d['checked_at'].isoformat() if d.get('checked_at') else None
        d['status_label'] = AVITO_STATUS_LABELS.get(d.get('status'), d.get('status'))
        items.append(d)

    return {
        'ok': True,
        'connected': bool(last.get('account_id')) and not last.get('error'),
        'last_sync': last,
        'last_report': report,
        'items': items,
    }
    return {
        'ok': True,
        'connected': bool(last.get('account_id')) and not last.get('error'),
        'last_sync': last,
    }


def _avito_full_sync(cur, conn, client_id, client_secret):
    """Полная синхронизация: баланс кошелька + отчёт по автозагрузке (статусы объявлений) +
    статистика просмотров/контактов. Токен запрашивается один раз и переиспользуется."""
    sync_result = _avito_sync(cur, conn, client_id, client_secret)
    if sync_result.get('error') or not sync_result.get('account_id'):
        return {'sync': sync_result}

    account_id = sync_result['account_id']
    token, err = _avito_get_token(client_id, client_secret)
    if err or not token:
        return {'sync': sync_result, 'report': {'error': err or 'Не удалось получить токен'}}

    report_result = _avito_fetch_report(cur, conn, token)
    stats_result = _avito_fetch_stats(cur, conn, token, account_id)
    return {'sync': sync_result, 'report': report_result, 'stats': stats_result}


def _avito_handle(cur, conn, params):
    """Обрабатывает action=avito_stats|avito_sync|avito_cron: проверяет подключение, баланс,
    отчёт по автозагрузке и статистику просмотров/контактов Авито."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, api_secret, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'avito' LIMIT 1")
    row = cur.fetchone()
    client_id = (row.get('api_key') or '').strip() if row else ''
    client_secret = (row.get('api_secret') or '').strip() if row else ''
    is_active = bool(row.get('is_active')) if row else False

    if not client_id or not client_secret:
        return _json({'error': 'Авито не настроено: заполните Client ID и Client Secret в Настройках → Интеграции → Площадки'}, 400)

    if action == 'avito_cron' or force_sync:
        if action == 'avito_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.avito_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < AVITO_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        full_result = _avito_full_sync(cur, conn, client_id, client_secret)
        data = _avito_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.avito_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        full_result = _avito_full_sync(cur, conn, client_id, client_secret)
        data = _avito_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    return _json(_avito_read_from_db(cur))


# ── Юла: Partner API (https://partner-api.youla.ru) ──────────────────────────
# В отличие от Авито/ЦИАН, у Юлы нет отдельного XML-фида как основного канала —
# публикация объектов идёт напрямую через REST (создание/обновление/архивация
# объявлений), что даёт мгновенный статус по каждому объекту вместо общего
# результата по фиду раз в N минут. Авторизация — простой Bearer-токен
# (api_key в ad_platform_keys), без client_secret. ID профиля (owner_id) и
# ID категории/подкатегории коммерческой недвижимости хранятся в extra —
# их выдают в личном кабинете партнёра/поддержке Юлы под конкретный аккаунт.

YOULA_BASE = 'https://partner-api.youla.ru'


YOULA_SYNC_INTERVAL_HOURS = 1


def _youla_request(method, path, token, payload=None, params=None):
    """Универсальный запрос к Youla Partner API (GET/POST/PUT/DELETE), Bearer-токен.

    timeout=8 (не 25!) — у платформы жёсткий gateway-таймаут ~30с на ВЕСЬ вызов
    функции (подтверждено на практике: запрос оборвался ровно на 30014мс), а на
    один объект может уйти 2+ последовательных запроса (создание/обновление +
    публикация). Старый timeout=25 позволял ОДНОМУ зависшему запросу съесть
    почти весь бюджет времени — логический тайм-бюджет (YOULA_PUBLISH_TIME_BUDGET_SEC)
    проверяется только МЕЖДУ итерациями цикла и не мог прервать уже начавшийся
    запрос, из-за чего вся синхронизация иногда обрывалась по 504 без сохранения
    прогресса — крон реально не успевал сработать по расписанию сутками."""
    url = f'{YOULA_BASE}{path}'
    if params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(8)) as r:
            body = r.read().decode()
            return (json.loads(body) if body else {}), None
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {}
        return None, f'HTTP {e.code}: {err_body}'
    except Exception as e:
        return None, str(e)


def _youla_sync(cur, conn, token, owner_id):
    """Проверяет заполненность токена+owner_id Юлы (без реального запроса к API).

    Раньше здесь дёргался GET /users/{owner_id} для проверки подключения и
    получения имени владельца профиля — но по ответу техподдержки Юлы права
    токена НЕ включают чтение данных пользователя (доступны только продукты и
    статистика), поэтому этот запрос стабильно возвращал 403 Forbidden и
    останавливал всю синхронизацию до публикации объявлений и сбора статистики
    (см. историю youla_sync_log — 0 успешных синхронизаций с 7 сентября).
    Теперь просто фиксируем факт «данные заполнены» и сразу переходим к
    публикации — она использует другие, разрешённые эндпоинты (/products)."""
    if not owner_id:
        cur.execute(f"INSERT INTO {SCHEMA}.youla_sync_log (synced_at, error) VALUES (NOW(), %s)",
                    ('Не указан ID профиля (owner_id) в настройках площадки',))
        conn.commit()
        return {'error': 'Не указан ID профиля (owner_id) в настройках площадки'}

    cur.execute(f"""
        INSERT INTO {SCHEMA}.youla_sync_log (synced_at, owner_id, owner_name)
        VALUES (NOW(), %s, NULL)
    """, (owner_id,))
    conn.commit()
    return {'owner_id': owner_id, 'owner_name': None}


def _youla_description(l):
    """Описание + строка «Код объекта: N» — однозначная привязка объявления на Юле
    к объекту каталога (API Юлы не даёт ни поля под внешний id, ни поиска своих
    объявлений — проверено: GET /products → 405, /users/{id}/products → 403)."""
    code_line = f"Код объекта: {l['id']}"
    desc = (l.get('description') or '').strip()
    return (desc[:5000 - len(code_line) - 2] + '\n\n' + code_line) if desc else code_line


def _youla_build_product(l, owner_id, category_id, subcategory_id):
    """Формирует тело CreateProduct/UpdateProduct для объекта listing."""
    price_val = _total_price(l)
    imgs = _split_images(l)[:10]
    addr_parts = [p for p in [l.get('city') or 'Краснодар', l.get('district'), l.get('address')] if p]
    body = {
        'name': _clean_title(l.get('title') or '')[:100] or 'Коммерческая недвижимость',
        'description': _youla_description(l),
        'price': int(price_val) * 100,  # Юла хранит цену в копейках
        'category': int(category_id),
        'subcategory': int(subcategory_id),
        'owner_id': owner_id,
        'images': imgs if imgs else [],
        'location': {
            'description': ', '.join(addr_parts),
            **({'latitude': float(l['lat']), 'longitude': float(l['lng'])} if l.get('lat') and l.get('lng') else {}),
        },
    }
    return body


YOULA_PUBLISH_TIME_BUDGET_SEC = 17  # см. комментарий в цикле ниже. У платформы жёсткий


# gateway-таймаут 30с (меньше, чем function.json timeout=60 — подтверждено на практике:
# запрос оборвался ровно на 30014мс) — суммарно publish+stats (см. YOULA_STATS_TIME_BUDGET_SEC
# ниже) должны укладываться в этот лимит с запасом на накладные расходы (открытие
# соединения с БД, чтение/парсинг ответов и т.п.), как уже сделано для Яндекс.CRM (22с).


def _youla_publish_listings(cur, conn, token, owner_id, category_id, subcategory_id):
    """Публикует/обновляет на Юле все объекты с export_youla=TRUE и архивирует те,
    у кого флаг сняли. Пишет статус каждого объекта в youla_item_status.

    Защита от дублей (одно объявление на один id объекта):
      • номер объявления ищется в listings, youla_item_status и youla_create_claims;
      • перед созданием ставится отметка «создаётся» (youla_create_claims) — второй
        запуск такой объект пропускает; номер сохраняется сразу после ответа Юлы;
      • при обрыве без ответа отметка остаётся, объект уходит в колокольчик «проверить».

    Удалённые на Юле объявления (is_deleted): Partner API не умеет их восстанавливать
    (publish → failed, unarchive/activate → 405). Они помечаются is_removed и
    пересоздаются НОВЫМ объявлением только по явному запросу админа
    (recreate_requested), и никогда — заблокированные модерацией.

    Скорость: обновления (PUT) идут параллельно по 6 потоков — раньше по одному, и
    за 17 секунд успевало 6 из 37 объектов. Запись в БД — из основного потока."""
    if not category_id or not subcategory_id:
        return {'error': 'Не указаны ID категории/подкатегории Юлы в настройках площадки'}

    # Выгрузка объектов — только XML-файлом: объект, впервые отмеченный для Юлы, получает
    # канал «файл». Через API Юла больше ничего не создаёт и не обновляет; этот цикл лишь
    # архивирует остатки API-объявлений у объектов канала «файл» (защита от дублей).
    cur.execute(f"""
        UPDATE {SCHEMA}.listings SET youla_channel = 'feed'
        WHERE export_youla = TRUE AND youla_channel IS NULL
    """)
    conn.commit()
    cur.execute(f"""
        SELECT id, title, description, price, price_unit, area, city, district, address, lat, lng, images, image, youla_ad_id
        FROM {SCHEMA}.listings
        WHERE export_youla = TRUE AND youla_channel = 'api'
          AND status = 'active' AND (is_visible IS NULL OR is_visible = TRUE)
        ORDER BY id ASC
    """)
    listings = [dict(r) for r in cur.fetchall()]

    cur.execute(f"""
        SELECT listing_id, youla_id FROM {SCHEMA}.youla_item_status WHERE youla_id IS NOT NULL
        UNION ALL
        SELECT listing_id, youla_id FROM {SCHEMA}.youla_create_claims WHERE youla_id IS NOT NULL
    """)
    known_ids = {}
    for r in cur.fetchall():
        known_ids.setdefault(r['listing_id'], r['youla_id'])
    cur.execute(f"SELECT listing_id, is_removed, is_blocked, recreate_requested, checked_at, sent_hash, sent_at FROM {SCHEMA}.youla_item_status")
    status_by_id = {r['listing_id']: dict(r) for r in cur.fetchall()}
    restore_rows = []
    for l in listings:
        if not l.get('youla_ad_id') and known_ids.get(l['id']):
            l['youla_ad_id'] = known_ids[l['id']]
            restore_rows.append((l['id'], l['youla_ad_id']))
    if restore_rows:
        # Одним запросом на все объекты (раньше — UPDATE на каждый объект в цикле).
        execute_values(cur, f"""
            UPDATE {SCHEMA}.listings AS t SET youla_ad_id = v.youla_id
            FROM (VALUES %s) AS v(id, youla_id)
            WHERE t.id = v.id::int AND t.youla_ad_id IS NULL
        """, restore_rows)
    conn.commit()

    # Удалённые и не заблокированные — пересоздаём: сбрасываем старый номер, дальше они
    # идут общим путём создания (с отметкой «создаётся»).
    # Автоматически НЕ пересоздаём: удаления на Юле бывают ручной чисткой дублей в
    # кабинете (24.09 — 24 объявления за 2 минуты, 09.10 — ещё 4) — авто-пересоздание
    # вернуло бы дубли. Пересоздаются только объекты, явно отмеченные админом
    # (youla_item_status.recreate_requested = TRUE).
    recreate_ids = []
    for l in listings:
        st = status_by_id.get(l['id']) or {}
        if l.get('youla_ad_id') and st.get('is_removed') and st.get('recreate_requested') and not st.get('is_blocked'):
            recreate_ids.append(l['id'])
            l['youla_ad_id'] = None
    if recreate_ids:
        cur.execute(f"UPDATE {SCHEMA}.listings SET youla_ad_id = NULL WHERE id = ANY(%s)", (recreate_ids,))
        cur.execute(f"UPDATE {SCHEMA}.youla_item_status SET youla_id = NULL, is_removed = FALSE, recreate_requested = FALSE WHERE listing_id = ANY(%s)", (recreate_ids,))
        conn.commit()

    start_ts = time.monotonic()
    created, updated, failed, skipped_budget, skipped_claimed = 0, 0, 0, 0, 0

    # ── 1. Обновления существующих объявлений — только то, что реально нужно отправить.
    # Удалённые на Юле (is_removed) не отправляем: Partner API их не восстанавливает, а
    # 33 таких объявления съедали ~15 с каждой синхронизации. Живые отправляем, только
    # если данные изменились с прошлой отправки (отпечаток тела запроса), плюс раз в
    # YOULA_RECHECK_HOURS — контрольная отправка, чтобы подтянуть статус модерации.
    now_utc = datetime.now(timezone.utc)
    _epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    to_update, skipped_removed, skipped_unchanged = [], 0, 0
    for l in listings:
        if not l.get('youla_ad_id'):
            continue
        st = status_by_id.get(l['id']) or {}
        if st.get('is_removed'):
            skipped_removed += 1
            continue
        body = _youla_build_product(l, owner_id, category_id, subcategory_id)
        l['_body'] = body
        l['_hash'] = _youla_body_hash(body)
        recheck_due = not st.get('sent_at') or (now_utc - st['sent_at']) >= timedelta(hours=YOULA_RECHECK_HOURS)
        if st.get('sent_hash') == l['_hash'] and not recheck_due:
            skipped_unchanged += 1
            continue
        to_update.append(l)
    to_update.sort(key=lambda l: (status_by_id.get(l['id']) or {}).get('sent_at') or _epoch)
    to_update = [l for l in to_update if not (status_by_id.get(l['id']) or {}).get('is_blocked')] + \
                [l for l in to_update if (status_by_id.get(l['id']) or {}).get('is_blocked')]

    def _put(l):
        return l, _youla_request('PUT', f"/products/{l['youla_ad_id']}", token, l['_body'])

    from concurrent.futures import ThreadPoolExecutor
    results = []
    with ThreadPoolExecutor(max_workers=YOULA_PARALLEL) as ex:
        futures = []
        for l in to_update:
            if _over_budget(start_ts, YOULA_PUBLISH_TIME_BUDGET_SEC):
                skipped_budget += 1
                continue
            futures.append(ex.submit(_put, l))
        for f in futures:
            results.append(f.result())

    status_rows, error_rows, sent_rows = [], [], []
    for l, (data, err) in results:
        if err or not data:
            failed += 1
            error_rows.append((l['id'], (err or 'Пустой ответ')[:500]))
            continue
        product = data.get('data') or data
        status_rows.append(_youla_status_row(l['id'], product))
        sent_rows.append((l['id'], l['_hash']))
        updated += 1
    _youla_save_status(cur, conn, status_rows, error_rows)
    _youla_save_sent(cur, conn, sent_rows)

    # ── 2. Создание новых (и пересоздание удалённых) — последовательно, с отметкой.
    to_create = [l for l in listings if not l.get('youla_ad_id')]
    photo_conflicts = _youla_photo_conflicts(cur, [l['id'] for l in to_create]) if to_create else {}
    skipped_photos = 0
    for l in to_create:
        if _over_budget(start_ts, YOULA_PUBLISH_TIME_BUDGET_SEC):
            skipped_budget += 1
            continue
        if photo_conflicts.get(l['id']):
            # Юла отклоняет объявления с фото, которые уже есть в другом объявлении
            # («Запрещено использовать одинаковые изображения»). Не создаём — показываем
            # предупреждение в кабинете, пока фото не заменят.
            skipped_photos += 1
            _youla_save_status(cur, conn, [], [(l['id'], 'Не опубликовано: те же фото, что у объекта №' +
                                                ', №'.join(str(x) for x in photo_conflicts[l['id']]) +
                                                '. Юла отклонит такое объявление — замените фото.')])
            continue
        cur.execute(f"""
            INSERT INTO {SCHEMA}.youla_create_claims (listing_id, claimed_at, claimed_by)
            VALUES (%s, NOW(), 'publish') ON CONFLICT (listing_id) DO NOTHING RETURNING listing_id
        """, (l['id'],))
        got_claim = cur.fetchone() is not None
        conn.commit()
        if not got_claim:
            skipped_claimed += 1
            continue

        body = _youla_build_product(l, owner_id, category_id, subcategory_id)
        data, err = _youla_request('POST', '/products', token, body)
        if err or not data:
            if err and str(err).startswith('HTTP 4'):
                # Юла явно отказала — объявление точно не создано, отметку снимаем.
                cur.execute(f"DELETE FROM {SCHEMA}.youla_create_claims WHERE listing_id = %s AND youla_id IS NULL", (l['id'],))
                conn.commit()
            failed += 1
            _youla_save_status(cur, conn, [], [(l['id'], (err or 'Пустой ответ')[:500])])
            continue

        product = data.get('data') or data
        youla_id = product.get('id')
        if not youla_id:
            failed += 1
            continue
        # Номер сохраняем СРАЗУ — до публикации и прочих шагов.
        cur.execute(f"UPDATE {SCHEMA}.listings SET youla_ad_id = %s WHERE id = %s", (youla_id, l['id']))
        cur.execute(f"UPDATE {SCHEMA}.youla_create_claims SET youla_id = %s, resolved_at = NOW() WHERE listing_id = %s",
                    (youla_id, l['id']))
        conn.commit()
        _youla_request('POST', '/products/publish', token, {'product_ids': [youla_id]}, params={'user_id': owner_id})
        _youla_save_status(cur, conn, [_youla_status_row(l['id'], product)], [])
        _youla_save_sent(cur, conn, [(l['id'], _youla_body_hash(body))])
        created += 1

    # ── 3. Архивация объектов, у которых сняли флаг export_youla.
    archived = 0
    dups_archived = []
    if not _over_budget(start_ts, YOULA_PUBLISH_TIME_BUDGET_SEC):
        cur.execute(f"""
            SELECT s.listing_id, s.youla_id FROM {SCHEMA}.youla_item_status s
            JOIN {SCHEMA}.listings l ON l.id = s.listing_id
            WHERE s.youla_id IS NOT NULL AND s.is_archived IS NOT TRUE AND s.is_removed IS NOT TRUE
              AND (l.export_youla = FALSE OR l.status != 'active' OR l.youla_channel = 'feed'
                   OR l.is_visible = FALSE)
        """)
        to_archive = [dict(r) for r in cur.fetchall()]
        if to_archive:
            ids = [r['youla_id'] for r in to_archive]
            _, err = _youla_request('POST', '/products/archive', token, {'product_ids': ids}, params={'user_id': owner_id})
            if not err:
                cur.execute(f"UPDATE {SCHEMA}.youla_item_status SET is_archived = TRUE, checked_at = NOW() WHERE youla_id = ANY(%s)", (ids,))
                dup_ids = [r['listing_id'] for r in to_archive]
                cur.execute(f"SELECT id FROM {SCHEMA}.listings WHERE id = ANY(%s) AND youla_channel = 'feed' AND export_youla = TRUE", (dup_ids,))
                dups_archived = [r['id'] for r in cur.fetchall()]
                conn.commit()
                archived = len(ids)

    return {
        'created': created, 'updated': updated, 'archived': archived, 'failed': failed,
        'total': len(listings), 'skipped_budget': skipped_budget,
        'skipped_claimed': skipped_claimed, 'recreated': len(recreate_ids),
        'sent': len(to_update), 'skipped_removed': skipped_removed, 'skipped_unchanged': skipped_unchanged,
        'skipped_photos': skipped_photos, 'duplicates_archived': dups_archived,
        'duration_sec': round(time.monotonic() - start_ts, 1),
    }


YOULA_RECHECK_HOURS = 24
YOULA_PARALLEL = 8


def _youla_body_hash(body):
    """Отпечаток отправляемых данных объявления: совпал с прошлым — отправлять незачем."""
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def _youla_save_sent(cur, conn, rows):
    """Отпечаток и время последней успешной отправки — одним запросом на все объекты."""
    if not rows:
        return
    execute_values(cur, f"""
        UPDATE {SCHEMA}.youla_item_status AS t SET sent_hash = v.h, sent_at = NOW()
        FROM (VALUES %s) AS v(listing_id, h) WHERE t.listing_id = v.listing_id::int
    """, rows)
    conn.commit()


def _youla_photo_conflicts(cur, listing_ids):
    """Для каждого объекта из listing_ids — номера ДРУГИХ объектов, выгружаемых на Юлу
    (любым каналом), у которых есть хотя бы одно такое же фото."""
    cur.execute(f"""
        WITH ph AS (
            SELECT l.id, TRIM(u) AS u FROM {SCHEMA}.listings l,
                 UNNEST(STRING_TO_ARRAY(COALESCE(NULLIF(l.images, ''), l.image, ''), '|')) AS u
            WHERE l.export_youla = TRUE AND l.status = 'active' AND (l.is_visible IS NULL OR l.is_visible = TRUE)
        )
        SELECT a.id, ARRAY_AGG(DISTINCT b.id ORDER BY b.id) AS others
        FROM ph a JOIN ph b ON a.u = b.u AND a.id <> b.id
        WHERE a.u <> '' AND a.id = ANY(%s)
        GROUP BY a.id
    """, (list(listing_ids),))
    return {r['id']: r['others'] for r in cur.fetchall()}


def _youla_channel_audit(cur):
    """Сверка каналов: объект канала «файл» не должен иметь живого API-объявления,
    объект канала «API» не должен попадать в файл. Возвращает список нарушений."""
    cur.execute(f"""
        SELECT l.id, l.title, s.youla_id FROM {SCHEMA}.listings l
        JOIN {SCHEMA}.youla_item_status s ON s.listing_id = l.id
        WHERE l.youla_channel = 'feed' AND l.export_youla = TRUE
          AND l.status = 'active' AND (l.is_visible IS NULL OR l.is_visible = TRUE)
          AND s.youla_id IS NOT NULL AND s.is_removed IS NOT TRUE AND s.is_archived IS NOT TRUE
        ORDER BY l.id
    """)
    return [dict(r) for r in cur.fetchall()]


def _youla_status_row(listing_id, product):
    return (listing_id, product.get('id'), product.get('url'), product.get('is_published'),
            product.get('is_archived'), product.get('is_blocked'), product.get('block_type_text'),
            bool(product.get('is_deleted')), product.get('date_deleted') or None)


def _youla_save_status(cur, conn, status_rows, error_rows):
    """Пакетная запись статусов объявлений Юлы (один запрос на все объекты)."""
    if status_rows:
        execute_values(cur, f"""
            INSERT INTO {SCHEMA}.youla_item_status
                (listing_id, youla_id, url, is_published, is_archived, is_blocked, block_type_text,
                 is_removed, removed_at, error, checked_at)
            VALUES %s
            ON CONFLICT (listing_id) DO UPDATE SET
                youla_id = EXCLUDED.youla_id, url = EXCLUDED.url, is_published = EXCLUDED.is_published,
                is_archived = EXCLUDED.is_archived, is_blocked = EXCLUDED.is_blocked,
                block_type_text = EXCLUDED.block_type_text, is_removed = EXCLUDED.is_removed,
                removed_at = EXCLUDED.removed_at, error = NULL, checked_at = NOW()
        """, status_rows, template="(%s,%s,%s,%s,%s,%s,%s,%s,NULLIF(%s,'')::timestamptz, NULL, NOW())")
    if error_rows:
        execute_values(cur, f"""
            INSERT INTO {SCHEMA}.youla_item_status (listing_id, error, checked_at)
            VALUES %s
            ON CONFLICT (listing_id) DO UPDATE SET error = EXCLUDED.error, checked_at = NOW()
        """, error_rows, template='(%s,%s, NOW())')
    conn.commit()


YOULA_STATS_TIME_BUDGET_SEC = 5  # запускается ПОСЛЕ publish (см. _youla_full_sync) —


# бюджет короткий, чтобы суммарно (публикация + статистика) укладываться в реальный
# gateway-таймаут ~30с (см. комментарий у YOULA_PUBLISH_TIME_BUDGET_SEC)


def _youla_fetch_stats(cur, conn, token):
    """Запрашивает статистику показов/просмотров/контактов за 30 дней по каждому
    объявлению, у которого уже есть youla_id. Тайм-бюджет + commit после каждого
    объявления — та же защита от потери прогресса, что и в _youla_publish_listings."""
    cur.execute(f"""
        SELECT s.listing_id, s.youla_id FROM {SCHEMA}.youla_item_status s
        JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        WHERE s.youla_id IS NOT NULL AND s.is_removed IS NOT TRUE AND s.is_archived IS NOT TRUE
          AND l.youla_channel = 'api'
    """)
    rows = [dict(r) for r in cur.fetchall()]
    if not rows:
        return {'skipped': True, 'reason': 'Нет объявлений с youla_id'}

    start_ts = time.monotonic()
    date_to = datetime.now(timezone.utc)
    date_from = date_to - timedelta(days=30)
    prm = {'from': date_from.strftime('%Y-%m-%dT%H:%M:%SZ'), 'to': date_to.strftime('%Y-%m-%dT%H:%M:%SZ')}

    def _one(row):
        return row, _youla_request('GET', f"/products/{row['youla_id']}/statistic", token, params=prm)

    from concurrent.futures import ThreadPoolExecutor
    skipped_budget = 0
    stat_rows = []
    with ThreadPoolExecutor(max_workers=YOULA_PARALLEL) as ex:
        futures = []
        for row in rows:
            if _over_budget(start_ts, YOULA_STATS_TIME_BUDGET_SEC):
                skipped_budget += 1
                continue
            futures.append(ex.submit(_one, row))
        for f in futures:
            row, (data, err) = f.result()
            if err or not data:
                continue
            stat = data.get('data') or data
            stat_rows.append((row['listing_id'], stat.get('shows'), stat.get('views'),
                              stat.get('contacts'), stat.get('unique_contacts')))
    # Запросы к API Юлы идут по одному (так устроено API), но в БД пишем один раз
    # пакетом — раньше был UPDATE + commit на каждое объявление.
    if stat_rows:
        execute_values(cur, f"""
            UPDATE {SCHEMA}.youla_item_status AS t
            SET shows = v.shows::int, views = v.views::int, contacts = v.contacts::int,
                unique_contacts = v.unique_contacts::int, checked_at = NOW()
            FROM (VALUES %s) AS v(listing_id, shows, views, contacts, unique_contacts)
            WHERE t.listing_id = v.listing_id::int
        """, stat_rows)
        conn.commit()
    updated = len(stat_rows)
    return {'updated': updated, 'requested': len(rows), 'skipped_budget': skipped_budget}


def _youla_read_from_db(cur):
    """Читает последнюю проверку подключения + статусы/статистику объявлений из БД."""
    cur.execute(f"SELECT * FROM {SCHEMA}.youla_sync_log ORDER BY synced_at DESC LIMIT 1")
    last = cur.fetchone()
    if not last:
        return {'ok': True, 'connected': False, 'last_sync': None, 'items': []}
    last = dict(last)
    last['synced_at'] = last['synced_at'].isoformat() if last.get('synced_at') else None
    last.pop('raw_response', None)

    cur.execute(f"""
        SELECT s.listing_id, s.youla_id, s.url, s.is_published, s.is_archived, s.is_blocked,
               s.block_type_text, s.views, s.shows, s.contacts, s.unique_contacts, s.error, s.checked_at,
               s.is_removed, s.removed_at, s.recreate_requested,
               l.title, l.city, l.category, l.deal, l.youla_channel
        FROM {SCHEMA}.youla_item_status s
        JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        WHERE l.export_youla = TRUE AND l.youla_channel = 'api'
        ORDER BY s.checked_at DESC
    """)
    items = []
    for r in cur.fetchall():
        d = dict(r)
        d['checked_at'] = d['checked_at'].isoformat() if d.get('checked_at') else None
        d['removed_at'] = d['removed_at'].isoformat() if d.get('removed_at') else None
        items.append(d)

    cur.execute(f"""
        SELECT youla_channel AS ch, COUNT(*) AS n FROM {SCHEMA}.listings
        WHERE export_youla = TRUE AND status = 'active' AND (is_visible IS NULL OR is_visible = TRUE)
        GROUP BY youla_channel
    """)
    channels = {(r['ch'] or 'api'): r['n'] for r in cur.fetchall()}
    cur.execute(f"""
        SELECT l.id, l.title FROM {SCHEMA}.listings l
        WHERE l.export_youla = TRUE AND l.youla_channel = 'feed'
          AND l.status = 'active' AND (l.is_visible IS NULL OR l.is_visible = TRUE)
        ORDER BY l.id
    """)
    feed_items = [dict(r) for r in cur.fetchall()]
    cur.execute(f"SELECT last_generated_at, is_active, cdn_url FROM {SCHEMA}.xml_feeds WHERE format = 'youla' ORDER BY id LIMIT 1")
    fr = cur.fetchone()
    feed = None
    if fr:
        feed = {'is_active': fr['is_active'], 'cdn_url': fr['cdn_url'],
                'last_generated_at': fr['last_generated_at'].isoformat() if fr.get('last_generated_at') else None}
    audit = _youla_channel_audit(cur)

    return {
        'ok': True,
        'connected': bool(last.get('owner_id')) and not last.get('error'),
        'last_sync': last,
        'items': items,
        'channels': {'feed': channels.get('feed', 0), 'api': channels.get('api', 0)},
        'feed_items': feed_items,
        'feed': feed,
        'channel_audit': {'ok': not audit, 'conflicts': audit, 'checked_at': datetime.now(timezone.utc).isoformat()},
    }


def _youla_feed_summary(cur):
    """Лёгкая сводка по XML-файлу Юлы для карточки рекламного кабинета: без запросов к API Юлы."""
    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {SCHEMA}.listings
        WHERE export_youla = TRUE AND status = 'active' AND (is_visible IS NULL OR is_visible = TRUE)
    """)
    count = (cur.fetchone() or {}).get('n') or 0
    cur.execute(f"SELECT is_active, cdn_url, last_generated_at FROM {SCHEMA}.xml_feeds WHERE format = 'youla' ORDER BY id LIMIT 1")
    fr = cur.fetchone()
    cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'youla' LIMIT 1")
    kr = cur.fetchone()
    gen = fr.get('last_generated_at') if fr else None
    if gen is not None and gen.tzinfo is None:
        gen = gen.replace(tzinfo=timezone.utc)
    hours = round((datetime.now(timezone.utc) - gen).total_seconds() / 3600, 1) if gen else None
    return {
        'ok': True,
        'listings_count': count,
        'feed_active': bool(fr and fr.get('is_active')),
        'cdn_url': fr.get('cdn_url') if fr else None,
        'last_generated_at': gen.isoformat() if gen else None,
        'hours_since': hours,
        'stale': hours is None or hours > 24,
        'api_active': bool(kr and kr.get('is_active')),
    }


def _youla_full_sync(cur, conn, token, owner_id, category_id, subcategory_id):
    """Полная синхронизация: проверка заполненности настроек → публикация/архивация
    объектов через /products → статистика через /products/{id}/statistic."""
    sync_result = _youla_sync(cur, conn, token, owner_id)
    if sync_result.get('error'):
        return {'sync': sync_result}
    publish_result = _youla_publish_listings(cur, conn, token, owner_id, category_id, subcategory_id)
    stats_result = _youla_fetch_stats(cur, conn, token)
    return {'sync': sync_result, 'publish': publish_result, 'stats': stats_result}


def _youla_webhook(cur, conn, event):
    """Приёмник вебхуков Юлы (CloudEvents-формат): тип события — в заголовке Ce-Type,
    тело — JSON конкретного события. Публичный эндпоинт без авторизации (Юла не
    поддерживает подпись запроса) — обрабатывает только известные типы, отвечает
    200 OK на любой валидный JSON, чтобы Юла не ретраила бесконечно.
    Типы событий: product.block, product.archive, message.incom, user.block, user.unblock."""
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    event_type = headers.get('ce-type', '')
    try:
        body = json.loads(event.get('body') or '{}')
    except (TypeError, ValueError):
        return _json({'ok': False, 'error': 'invalid json'}, 200)

    if event_type == 'product.block':
        product_id = body.get('product_id')
        block_types = body.get('block_types') or []
        block_text = '; '.join(bt.get('block_description', '') for bt in block_types if bt.get('block_description'))
        cur.execute(f"""
            UPDATE {SCHEMA}.youla_item_status
            SET is_blocked = TRUE, block_type_text = %s, checked_at = NOW()
            WHERE youla_id = %s
        """, (block_text[:2000] or None, product_id))
        conn.commit()
        return _json({'ok': True})

    if event_type == 'product.archive':
        product_id = body.get('product_id')
        cur.execute(f"""
            UPDATE {SCHEMA}.youla_item_status
            SET is_archived = TRUE, checked_at = NOW()
            WHERE youla_id = %s
        """, (product_id,))
        conn.commit()
        return _json({'ok': True})

    if event_type == 'message.incom':
        product_id = body.get('product_id')
        listing_id = None
        if product_id:
            cur.execute(f"SELECT listing_id FROM {SCHEMA}.youla_item_status WHERE youla_id = %s", (product_id,))
            row = cur.fetchone()
            listing_id = row['listing_id'] if row else None
        images = body.get('images')
        cur.execute(f"""
            INSERT INTO {SCHEMA}.youla_messages
                (chat_id, product_id, listing_id, sender_id, recipient_id, direction, message, images, created_at)
            VALUES (%s, %s, %s, %s, %s, 'in', %s, %s, NOW())
        """, (body.get('chat_id'), product_id, listing_id, body.get('sender_id'), body.get('recipient_id'),
              body.get('message'), json.dumps(images) if images else None))
        conn.commit()
        return _json({'ok': True})

    if event_type in ('user.block', 'user.unblock'):
        is_blocked = bool(body.get('is_blocked'))
        block_type = body.get('block_type') or ''
        error_text = f"Профиль заблокирован на Юле: {block_type}" if is_blocked else None
        cur.execute(f"""
            INSERT INTO {SCHEMA}.youla_sync_log (synced_at, owner_id, error)
            VALUES (NOW(), %s, %s)
        """, (body.get('user_id'), error_text))
        conn.commit()
        return _json({'ok': True})

    # Неизвестный/пустой тип события — отвечаем 200, чтобы Юла не повторяла отправку.
    return _json({'ok': True, 'skipped': True, 'event_type': event_type})


def _youla_handle(cur, conn, params):
    """Обрабатывает action=youla_stats|youla_sync|youla_cron: проверка подключения,
    публикация/архивация объектов по флагу export_youla, статистика показов/контактов."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, extra, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'youla' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    extra = (row.get('extra') or {}) if row else {}
    is_active = bool(row.get('is_active')) if row else False
    owner_id = str(extra.get('owner_id') or '').strip()
    category_id = str(extra.get('category_id') or '').strip()
    subcategory_id = str(extra.get('subcategory_id') or '').strip()

    if not token or not owner_id:
        return _json({'error': 'Юла не настроена: заполните Токен и ID профиля в Настройках → Интеграции → Площадки'}, 400)

    if (action == 'youla_cron' or force_sync) and not is_active:
        return _json({**_youla_read_from_db(cur), 'skipped': True, 'reason': 'Прямое подключение выключено — выгрузка XML-файлом'})

    if action == 'youla_cron' or force_sync:
        if action == 'youla_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.youla_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < YOULA_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        full_result = _youla_full_sync(cur, conn, token, owner_id, category_id, subcategory_id)
        data = _youla_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.youla_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        full_result = _youla_full_sync(cur, conn, token, owner_id, category_id, subcategory_id)
        data = _youla_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': full_result})

    return _json(_youla_read_from_db(cur))


# ── DomClick Stats API ──────────────────────────────────────────────────────
# Официальная документация: https://public-api.domclick.ru/stats/swagger
# У площадки всего 2 эндпоинта, оба GET, оба read-only (нет публикации объектов
# через это API — только XML-фид, который у нас уже реализован отдельно):
#   GET /v1/companies/{company_id}/offers — список объявлений + статистика за всё время
#   GET /v1/companies/{company_id}/statistic-by-days/{offer_id} — статистика по дням (макс. 90 дней)
# Сопоставление с объектами сайта — по полю feed_offer_id (это internal-id offer'а
# в нашем XML-фиде ДомКлик, т.е. l["id"] из _build_yandex — см. company_id/token
# в ad_platform_keys.extra.company_id и api_key).
#
# ВАЖНО: реальный формат ответа отличается от документации в OpenAPI-схеме —
# площадка оборачивает данные в {"result": ..., "errors": [...], "success": bool},
# а не отдаёт голый массив/объект напрямую. Поля status/deal_type/source в
# реальном ответе — уже готовые русские текстовые лейблы («Опубликовано»,
# «Аренда», «Фид»), а НЕ числовые коды/enum, как заявлено в схеме — сверено
# напрямую с продовым ответом API, поэтому храним/показываем их как есть,
# без маппинга по словарю.


def _domclick_request(path, token, params=None):
    """GET-запрос к DomClick Stats API. Токен передаётся query-параметром `token`
    (не заголовком — так требует документация площадки). Разворачивает обёртку
    {"result": ..., "success": bool, "errors": [...]}, которую реально отдаёт API.
    Площадка блокирует запросы со стандартным User-Agent Python (отдаёт HTML-страницу
    защиты вместо JSON) — подставляем браузерный User-Agent, как для остальных площадок."""
    url = f'{DOMCLICK_STATS_BASE}{path}'
    all_params = {'token': token, **(params or {})}
    url += '?' + urllib.parse.urlencode(all_params, doseq=True)
    req = urllib.request.Request(url, method='GET', headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=http_timeout(25)) as r:
            body = r.read().decode()
            data = json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode())
        except Exception:
            err_body = {}
        return None, f'HTTP {e.code}: {err_body}'
    except Exception as e:
        return None, str(e)

    if isinstance(data, dict) and 'result' in data:
        if data.get('success') is False:
            errs = data.get('errors') or []
            msg = '; '.join(str(e.get('message', e)) for e in errs) if errs else 'Неизвестная ошибка API'
            return None, msg
        return data.get('result'), None
    return data, None


DOMCLICK_SYNC_TIME_BUDGET_SEC = 22  # см. комментарий в цикле ниже. У платформы жёсткий


# gateway-таймаут ~30с (меньше, чем function.json timeout=60 — подтверждено на практике
# на этой же функции при синхронизации Юлы) — бюджет должен укладываться в этот лимит
# с запасом на накладные расходы, как уже сделано для Яндекс.CRM (22с).


def _domclick_sync_offers(cur, conn, token, company_id):
    """Постранично забирает все объявления компании (эндпоинт /offers) вместе
    со статистикой (views, phone_shows, search_shows, chats, favorites) и
    сохраняет в domclick_item_status. Сопоставляет с объектом сайта по
    feed_offer_id (internal-id из нашего XML-фида ДомКлик == listing.id).

    Тайм-бюджет + commit после каждой полученной страницы (а не один общий
    commit в конце) — тот же паттерн, что уже используется для Яндекс.CRM
    (см. _yandex_crm_sync): при большом каталоге и/или медленном ответе API
    ДомКлика ждать полного обхода всех страниц рискованно — функция может
    упереться в лимит времени и оборвать выполнение, потеряв уже полученные,
    но ещё не сохранённые данные. Если бюджет исчерпан — то, что успели
    обработать, уже закоммичено, а необработанный остаток дообработается на
    следующем тике крона (last_offer_id продолжает обход с той же точки)."""
    start_ts = time.monotonic()
    last_offer_id = 0
    total = 0
    budget_exceeded = False
    while True:
        if _over_budget(start_ts, DOMCLICK_SYNC_TIME_BUDGET_SEC):
            budget_exceeded = True
            break
        data, err = _domclick_request(
            f'/v1/companies/{company_id}/offers', token,
            params={'last_offer_id': last_offer_id, 'limit': 1000},
        )
        if err:
            cur.execute(f"INSERT INTO {SCHEMA}.domclick_sync_log (synced_at, error) VALUES (NOW(), %s)", (err[:500],))
            conn.commit()
            return {'error': err}
        offers = data if isinstance(data, list) else []
        if not offers:
            break

        page_rows = {}
        for o in offers:
            statistics = o.get('statistics') or {}
            moderation = o.get('moderation') or {}
            feed_offer_id = o.get('feed_offer_id')
            listing_id = None
            if feed_offer_id:
                try:
                    listing_id = int(feed_offer_id)
                except (TypeError, ValueError):
                    listing_id = None
            if o.get('offer_id') is not None:
                page_rows[o.get('offer_id')] = (
                    o.get('offer_id'), feed_offer_id, listing_id, o.get('status'), o.get('source'),
                    o.get('domclick_link'), o.get('offer_type'), o.get('deal_type'), o.get('is_duplicate'),
                    moderation.get('reason'), moderation.get('comment'), o.get('published_dt'), o.get('publish_end_dt'),
                    statistics.get('views'), statistics.get('phone_shows'), statistics.get('search_shows'),
                    statistics.get('chats_total'), statistics.get('chats_answered'), statistics.get('chats_unanswered'),
                    statistics.get('favorites'),
                    '; '.join(o.get('errors') or []) or None,
                )
            total += 1
            last_offer_id = o.get('offer_id') or last_offer_id

        # Вся страница — одним пакетным запросом (лимит частоты запросов к БД платформы).
        if page_rows:
            execute_values(cur, f"""
                INSERT INTO {SCHEMA}.domclick_item_status
                    (offer_id, feed_offer_id, listing_id, status, source, domclick_link, offer_type, deal_type,
                     is_duplicate, moderation_reason, moderation_comment, published_dt, publish_end_dt,
                     views, phone_shows, search_shows, chats_total, chats_answered, chats_unanswered,
                     favorites, errors, checked_at)
                VALUES %s
                ON CONFLICT (offer_id) DO UPDATE SET
                    feed_offer_id = EXCLUDED.feed_offer_id, listing_id = EXCLUDED.listing_id,
                    status = EXCLUDED.status, source = EXCLUDED.source, domclick_link = EXCLUDED.domclick_link,
                    offer_type = EXCLUDED.offer_type, deal_type = EXCLUDED.deal_type,
                    is_duplicate = EXCLUDED.is_duplicate, moderation_reason = EXCLUDED.moderation_reason,
                    moderation_comment = EXCLUDED.moderation_comment, published_dt = EXCLUDED.published_dt,
                    publish_end_dt = EXCLUDED.publish_end_dt, views = EXCLUDED.views,
                    phone_shows = EXCLUDED.phone_shows, search_shows = EXCLUDED.search_shows,
                    chats_total = EXCLUDED.chats_total, chats_answered = EXCLUDED.chats_answered,
                    chats_unanswered = EXCLUDED.chats_unanswered, favorites = EXCLUDED.favorites,
                    errors = EXCLUDED.errors, checked_at = NOW()
            """, list(page_rows.values()),
                template='(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())')

        conn.commit()  # сохраняем страницу сразу — не ждём обхода всех страниц

        if len(offers) < 1000:
            break

    # budget_exceeded НЕ пишем в колонку error — это не сбой подключения, а штатное
    # разбиение большого каталога на несколько тиков крона (см. _domclick_read_from_db,
    # где error используется для connected=False/красного баннера ошибки в UI).
    cur.execute(f"INSERT INTO {SCHEMA}.domclick_sync_log (synced_at, offers_count) VALUES (NOW(), %s)", (total,))
    conn.commit()
    return {'offers_count': total, 'budget_exceeded': budget_exceeded}


def _domclick_read_from_db(cur):
    """Читает последнюю синхронизацию + статусы/статистику объявлений из БД."""
    cur.execute(f"SELECT * FROM {SCHEMA}.domclick_sync_log ORDER BY synced_at DESC LIMIT 1")
    last = cur.fetchone()
    if not last:
        return {'ok': True, 'connected': False, 'last_sync': None, 'items': []}
    last = dict(last)
    last['synced_at'] = last['synced_at'].isoformat() if last.get('synced_at') else None

    cur.execute(f"""
        SELECT s.offer_id, s.feed_offer_id, s.listing_id, s.status, s.source, s.domclick_link,
               s.offer_type, s.deal_type, s.is_duplicate, s.moderation_reason, s.moderation_comment,
               s.published_dt, s.publish_end_dt, s.views, s.phone_shows, s.search_shows,
               s.chats_total, s.chats_answered, s.chats_unanswered, s.favorites, s.errors, s.checked_at,
               l.title, l.city, l.category, l.deal
        FROM {SCHEMA}.domclick_item_status s
        LEFT JOIN {SCHEMA}.listings l ON l.id = s.listing_id
        ORDER BY s.checked_at DESC
    """)
    items = []
    for r in cur.fetchall():
        d = dict(r)
        for k in ('published_dt', 'publish_end_dt', 'checked_at'):
            if d.get(k):
                d[k] = d[k].isoformat()
        items.append(d)

    return {'ok': True, 'connected': not last.get('error'), 'last_sync': last, 'items': items}


def _domclick_handle(cur, conn, params):
    """Обрабатывает action=domclick_stats|domclick_sync|domclick_cron: синхронизация
    и чтение статистики объявлений компании из DomClick Stats API."""
    action = params.get('action', '')
    force_sync = params.get('sync') == '1'

    cur.execute(f"SELECT api_key, extra, is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = 'domclick' LIMIT 1")
    row = cur.fetchone()
    token = (row.get('api_key') or '').strip() if row else ''
    extra = (row.get('extra') or {}) if row else {}
    is_active = bool(row.get('is_active')) if row else False
    company_id = str(extra.get('company_id') or '').strip()

    if not token or not company_id:
        return _json({'error': 'ДомКлик не настроен: заполните Токен и ID компании в Настройках → Интеграции → Площадки'}, 400)

    if action == 'domclick_cron' or force_sync:
        if action == 'domclick_cron':
            if not is_active:
                return _json({'ok': True, 'skipped': True, 'reason': 'Интеграция выключена'})
            cur.execute(f"SELECT synced_at FROM {SCHEMA}.domclick_sync_log ORDER BY synced_at DESC LIMIT 1")
            last = cur.fetchone()
            if last and last['synced_at']:
                elapsed = (datetime.now(last['synced_at'].tzinfo) - last['synced_at']).total_seconds() / 3600
                if elapsed < DOMCLICK_SYNC_INTERVAL_HOURS:
                    return _json({'ok': True, 'skipped': True, 'reason': f'Последняя синхронизация {round(elapsed, 1)}ч назад'})

        sync_result = _domclick_sync_offers(cur, conn, token, company_id)
        data = _domclick_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': sync_result})

    cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.domclick_sync_log")
    never_synced = cur.fetchone()['c'] == 0

    if never_synced:
        sync_result = _domclick_sync_offers(cur, conn, token, company_id)
        data = _domclick_read_from_db(cur)
        return _json({**data, 'synced_now': True, 'sync_result': sync_result})

    return _json(_domclick_read_from_db(cur))


# Порог «протухания» для алерта — если площадка активна, но реальной синхронизации
# не было дольше этого времени, считаем её проблемной. Каждая площадка синхронизируется
# раз в час (см. *_SYNC_INTERVAL_HOURS выше) — 24 часа даёт большой запас на случайный
# пропуск нескольких крон-тиков, но всё равно ловит реальные многодневные обрывы вроде
# того, что случился 19-21 сентября.
SYNC_HEALTH_THRESHOLD_HOURS = 24


def _sync_health_check(cur):
    """Проверяет для каждой ВКЛЮЧЕННОЙ площадки (ad_platform_keys.is_active=TRUE),
    когда была последняя синхронизация, и возвращает список тех, кто не обновлялся
    дольше SYNC_HEALTH_THRESHOLD_HOURS. Площадки группы «Разное» проверяются по
    last_generated_at из xml_feeds (свежая generation среди активных фидов), а не
    по platform_keys — у них нет отдельного ключа API, это статические фиды."""
    now = datetime.now(timezone.utc)
    threshold = timedelta(hours=SYNC_HEALTH_THRESHOLD_HOURS)
    stale = []

    platform_checks = [
        ('cian', 'ЦИАН', 'cian_sync_log'),
        ('yandex_realty', 'Яндекс.Недвижимость', 'yandex_sync_log'),
        ('avito', 'Авито', 'avito_sync_log'),
        ('youla', 'Юла', 'youla_sync_log'),
        ('domclick', 'ДомКлик', 'domclick_sync_log'),
    ]

    for platform_key, label, log_table in platform_checks:
        cur.execute(f"SELECT is_active FROM {SCHEMA}.ad_platform_keys WHERE platform = '{platform_key}' LIMIT 1")
        row = cur.fetchone()
        if not row or not row.get('is_active'):
            continue  # площадка не подключена — не считаем это сбоем синхронизации

        cur.execute(f"SELECT MAX(synced_at) AS last_sync FROM {SCHEMA}.{log_table}")
        last_row = cur.fetchone()
        last_sync = last_row.get('last_sync') if last_row else None

        if not last_sync:
            stale.append({'key': platform_key, 'label': label, 'last_sync': None, 'hours_ago': None})
            continue

        elapsed = now - last_sync
        if elapsed > threshold:
            stale.append({
                'key': platform_key, 'label': label,
                'last_sync': last_sync.isoformat(),
                'hours_ago': round(elapsed.total_seconds() / 3600, 1),
            })

    # «Разное» — группа статических фидов, проверяем по самой свежей генерации
    # среди активных фидов формата 'other' (один общий флаг на все площадки группы).
    cur.execute(f"SELECT MAX(last_generated_at) AS last_gen FROM {SCHEMA}.xml_feeds WHERE format = 'other' AND is_active = TRUE")
    other_row = cur.fetchone()
    last_gen = other_row.get('last_gen') if other_row else None
    if last_gen:
        last_gen_aware = last_gen if last_gen.tzinfo else last_gen.replace(tzinfo=timezone.utc)
        elapsed = now - last_gen_aware
        if elapsed > threshold:
            stale.append({
                'key': 'other', 'label': 'Разное',
                'last_sync': last_gen_aware.isoformat(),
                'hours_ago': round(elapsed.total_seconds() / 3600, 1),
            })

    # Ошибки последних синхронизаций (из platform_sync_state — пишется кроном xml-feeds):
    # площадка может быть «свежей» по журналу, но падать на каждой новой попытке.
    failing = []
    labels = {k: lbl for k, lbl, _ in platform_checks}
    try:
        cur.execute(
            f"SELECT platform, consecutive_errors, last_error, last_attempt_at, last_success_at, paused_until "
            f"FROM {SCHEMA}.platform_sync_state WHERE consecutive_errors > 0"
        )
        log_tables = {k: t for k, _, t in platform_checks}
        for r in cur.fetchall():
            # Если после неудачной попытки крона площадка успешно синхронизировалась
            # другим путём (кнопка «Синхронизировать» в рекламном кабинете) — это уже
            # не проблема, не показываем ложную тревогу в колокольчике.
            tbl = log_tables.get(r['platform'])
            if tbl and r.get('last_attempt_at'):
                cur.execute(
                    f"SELECT 1 FROM {SCHEMA}.{tbl} WHERE synced_at > %s AND (error IS NULL OR error = '') LIMIT 1",
                    (r['last_attempt_at'],)
                )
                if cur.fetchone():
                    continue
            failing.append({
                'key': r['platform'], 'label': labels.get(r['platform'], r['platform']),
                'errors': r['consecutive_errors'], 'last_error': (r.get('last_error') or '')[:300],
                'last_attempt': r['last_attempt_at'].isoformat() if r.get('last_attempt_at') else None,
                'paused_until': r['paused_until'].isoformat() if r.get('paused_until') else None,
            })
    except Exception:
        pass

    # Юла: создание объявления оборвалось между отправкой и ответом (отметка есть,
    # номера нет > 10 мин). Автоповтора нет — иначе возможен дубль; нужна ручная проверка.
    try:
        cur.execute(f"""
            SELECT c.listing_id, c.claimed_at, l.title FROM {SCHEMA}.youla_create_claims c
            LEFT JOIN {SCHEMA}.listings l ON l.id = c.listing_id
            WHERE c.youla_id IS NULL AND c.claimed_at < NOW() - INTERVAL '10 minutes'
            ORDER BY c.claimed_at
        """)
        for r in cur.fetchall():
            failing.append({
                'key': f"youla_claim_{r['listing_id']}",
                'label': f"Юла: проверить объект №{r['listing_id']}",
                'errors': 0,
                'last_error': (
                    f"Отправка объявления оборвалась без ответа Юлы. Проверьте в кабинете Юлы, есть ли "
                    f"объявление с текстом «Код объекта: {r['listing_id']}»"
                    + (f" ({(r.get('title') or '')[:80]})" if r.get('title') else '')
                    + ". Если объявления нет — нажмите «Отправить снова»."
                ),
                'last_attempt': r['claimed_at'].isoformat() if r.get('claimed_at') else None,
                'paused_until': None,
                'listing_id': r['listing_id'],
            })
    except Exception:
        pass

    # Юла, сверка каналов: объект из файла с живым API-объявлением = дубль на Юле.
    # Синхронизация сама отправляет такие объявления в архив; если не вышло — тревога.
    try:
        for r in _youla_channel_audit(cur):
            failing.append({
                'key': f"youla_dup_{r['id']}",
                'label': f"Юла: дубль объекта №{r['id']}",
                'errors': 0,
                'last_error': (
                    f"Объект выгружается файлом и одновременно имеет объявление через API ({r['youla_id']}). "
                    f"Ближайшая синхронизация Юлы отправит API-объявление в архив; если тревога не уйдёт — "
                    f"снимите его вручную в кабинете Юлы (в описании есть «Код объекта: {r['id']}»)."
                ),
                'last_attempt': None, 'paused_until': None, 'listing_id': r['id'],
            })
    except Exception:
        pass

    return {'ok': True, 'stale': stale, 'failing': failing, 'checked_at': now.isoformat()}


PLATFORM_RETRY_MINUTES = 20


PLATFORM_MAX_ERRORS = 3


PLATFORM_PAUSE_HOURS = 2


# (ключ площадки, action для принудительной синхронизации, журнал синхронизации).
# Вызываем *_stats с sync=1, а не *_cron: у *_cron внутри своя проверка «последняя
# запись в журнале < 1 часа» — она учитывает и записи с ОШИБКОЙ, из-за чего повтор
# после сбоя блокировался бы на час. Свежесть и активность проверяем сами выше.
PLATFORM_ROTATION = [
    ('cian', 'cian_stats', 'cian_sync_log'),
    ('yandex_realty', 'yandex_stats', 'yandex_sync_log'),
    ('avito', 'avito_stats', 'avito_sync_log'),
    ('youla', 'youla_stats', 'youla_sync_log'),
    ('domclick', 'domclick_stats', 'domclick_sync_log'),
]


def _platform_handler(key):
    return {
        'cian': _cian_handle,
        'yandex_realty': _yandex_calls_handle,
        'avito': _avito_handle,
        'youla': _youla_handle,
        'domclick': _domclick_handle,
    }[key]


def _extract_sync_error(body):
    """Достаёт текст ошибки из ответа синхронизации площадки (у каждой площадки
    своя вложенность: error / sync_result.error / sync_result.sync.error / ...)."""
    if not isinstance(body, dict):
        return None
    if body.get('error'):
        return str(body['error'])
    sr = body.get('sync_result')
    if isinstance(sr, dict):
        if sr.get('error'):
            return str(sr['error'])
        for part in ('sync', 'report', 'publish'):
            sub = sr.get(part)
            if isinstance(sub, dict) and sub.get('error'):
                return f'{part}: {sub["error"]}'
    return None


def _run_next_platform_sync(cur, conn):
    """Выбирает ОДНУ площадку для синхронизации в этом вызове и синхронизирует её.

    Вместо жёсткого круга по времени (раньше: площадка = номер 20-минутного окна) —
    выбор по состоянию: берётся площадка, которая дольше всех не синхронизировалась
    успешно. Площадки, которые уже пробовали в последние PLATFORM_RETRY_MINUTES,
    а также поставленные на паузу после PLATFORM_MAX_ERRORS ошибок подряд, пропускаются.
    Если все площадки свежие (успех < 1 часа назад) — шаг пропускается целиком,
    и всё время вызова уходит на фиды. Состояние — в platform_sync_state."""
    now = datetime.now(timezone.utc)
    cur.execute(f"SELECT platform, is_active FROM {SCHEMA}.ad_platform_keys")
    active = {r['platform'] for r in cur.fetchall() if r.get('is_active')}
    cur.execute(f"SELECT * FROM {SCHEMA}.platform_sync_state")
    state = {r['platform']: dict(r) for r in cur.fetchall()}

    candidates = []
    for key, action, log_table in PLATFORM_ROTATION:
        if key not in active:
            continue
        st = state.get(key) or {}
        if st.get('paused_until') and st['paused_until'] > now:
            continue
        if st.get('last_attempt_at') and (now - st['last_attempt_at']) < timedelta(minutes=PLATFORM_RETRY_MINUTES):
            continue
        cur.execute(f"SELECT MAX(synced_at) AS m FROM {SCHEMA}.{log_table} WHERE error IS NULL OR error = ''")
        last_ok = (cur.fetchone() or {}).get('m')
        if last_ok and (now - last_ok) < timedelta(hours=1):
            continue
        candidates.append((last_ok or datetime(1970, 1, 1, tzinfo=timezone.utc), key, action))

    if not candidates:
        return None, None

    candidates.sort(key=lambda c: c[0])
    _, key, action = candidates[0]

    if not _state_write(cur, conn,
        f"INSERT INTO {SCHEMA}.platform_sync_state (platform, last_attempt_at, updated_at) "
        f"VALUES ('{key}', NOW(), NOW()) "
        f"ON CONFLICT (platform) DO UPDATE SET last_attempt_at = NOW(), updated_at = NOW()"
    ):
        # БД перегружена уже до начала — не трогаем площадку, попробуем в следующий запуск.
        return None, None

    try:
        resp = _platform_handler(key)(cur, conn, {'action': action, 'sync': '1'})
        body = json.loads(resp['body']) if isinstance(resp, dict) and 'body' in resp else resp
        err = _extract_sync_error(body)
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        err = f'{type(e).__name__}: {str(e)[:300]}'
        body = {'error': err}
        print(f'[xml-feeds cron] {key} failed: {err}')

    if err:
        _state_write(cur, conn,
            f"UPDATE {SCHEMA}.platform_sync_state SET "
            f"consecutive_errors = consecutive_errors + 1, last_error = %s, "
            f"paused_until = CASE WHEN consecutive_errors + 1 >= {PLATFORM_MAX_ERRORS} "
            f"THEN NOW() + INTERVAL '{PLATFORM_PAUSE_HOURS} hours' ELSE NULL END, "
            f"updated_at = NOW() WHERE platform = '{key}'",
            (err[:1000],)
        )
    else:
        _state_write(cur, conn,
            f"UPDATE {SCHEMA}.platform_sync_state SET consecutive_errors = 0, last_error = NULL, "
            f"paused_until = NULL, last_success_at = NOW(), updated_at = NOW() WHERE platform = '{key}'"
        )
    return key, body


def _state_write(cur, conn, sql, args=None, attempts=4):
    """Запись состояния синхронизации площадки с повтором при перегрузке БД.

    Раньше, если ошибку площадки («rate limit exceeded») не удавалось ЗАПИСАТЬ из-за
    той же перегрузки, исключение роняло весь запуск: счётчик ошибок не рос
    (уведомление показывало «1 подряд» при 2+ сбоях, пауза после 3 ошибок не
    включалась), а фиды в этом запуске не собирались. Теперь — 4 попытки с паузой
    1/2/3 с; если так и не получилось, запуск продолжается без падения."""
    for i in range(attempts):
        try:
            cur.execute(sql, args) if args is not None else cur.execute(sql)
            conn.commit()
            return True
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            if i == attempts - 1:
                print(f'[xml-feeds cron] state write failed: {type(e).__name__}: {str(e)[:200]}')
                return False
            time.sleep(i + 1)
    return False


CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization, Authorization, X-User-Id, X-Session-Id, X-Cron-Token',
    'Access-Control-Max-Age': '86400',
}

PLATFORM_ACTIONS = {
    'cian': ('cian_stats', 'cian_sync', 'cian_cron'),
    'yandex_realty': ('yandex_stats', 'yandex_sync', 'yandex_cron'),
    'avito': ('avito_stats', 'avito_sync', 'avito_cron'),
    'youla': ('youla_stats', 'youla_sync', 'youla_cron'),
    'domclick': ('domclick_stats', 'domclick_sync', 'domclick_cron'),
}


def _cron_turn(cur, conn, rid, source):
    """Автоматический запуск: блокировка от параллельных вызовов + ОДНА площадка."""
    cur.execute(
        f"UPDATE {SCHEMA}.cron_locks SET locked_until = NOW() + INTERVAL '{CRON_LOCK_TTL_SEC} seconds', "
        f"locked_by = %s, updated_at = NOW() "
        f"WHERE name = '{CRON_LOCK_NAME}' AND (locked_until IS NULL OR locked_until < NOW()) RETURNING name",
        (rid,)
    )
    got = cur.fetchone() is not None
    conn.commit()
    if not got:
        return _json({'ok': True, 'skipped': True, 'reason': 'already_running'})
    try:
        turn_key, turn_result = _run_next_platform_sync(cur, conn)
        err = turn_result.get('error') if isinstance(turn_result, dict) else None
        print(json.dumps({'event': 'platform_cron', 'source': source, 'platform': turn_key,
                          'error': err, 'duration_ms': call_elapsed_ms()}, ensure_ascii=False))
        return _json({'ok': True, 'synced_platform': turn_key, 'error': err, 'duration_ms': call_elapsed_ms()})
    finally:
        try:
            conn.rollback()
            cur.execute(
                f"UPDATE {SCHEMA}.cron_locks SET locked_until = NULL, updated_at = NOW() "
                f"WHERE name = '{CRON_LOCK_NAME}' AND locked_by = %s", (rid,)
            )
            conn.commit()
        except Exception:
            pass


def handler(event, context):
    """Синхронизация рекламных кабинетов площадок: одна площадка за вызов, не дольше 25 с."""
    start_call(PLATFORM_WORK_SEC)
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    headers_lc = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    expected = os.environ.get('CRON_SECRET', '')
    is_schedule = bool(expected) and headers_lc.get('x-cron-token') == expected
    if is_schedule and 'action' not in params:
        params = {**params, 'action': 'cron'}
    action = params.get('action', '')
    rid = str(getattr(context, 'request_id', None) or uuid.uuid4())

    try:
        conn = db_connect(os.environ['DATABASE_URL'])
    except Exception as e:
        if is_rate_limit(e):
            return busy_response()
        raise
    try:
        with conn.cursor() as cur:
            if method == 'GET' and action == 'cron':
                return _cron_turn(cur, conn, rid, 'schedule' if is_schedule else 'visitor')

            if method == 'GET':
                for key, acts in PLATFORM_ACTIONS.items():
                    if action in acts:
                        return _platform_handler(key)(cur, conn, params)

            if method == 'GET' and action == 'sync_health':
                return _json(_sync_health_check(cur))

            if method == 'GET' and action == 'other_platforms':
                # Вкладка «Разное»: площадки формата 'other' и общий список выгружаемых объектов
                # (один флаг export_other на все). Список отдаём ОДИН раз, а не копией в каждой
                # площадке: 44 × 155 объектов давали ответ больше лимита платформы 3.67 МБ.
                cur.execute(
                    f"SELECT id, slug, name, is_active, cdn_url, last_generated_at, supports_stats "
                    f"FROM {SCHEMA}.xml_feeds WHERE format = 'other' ORDER BY id ASC"
                )
                feeds = [dict(r) for r in cur.fetchall()]
                cur.execute(
                    f"SELECT id, title, image, category, deal, city, status "
                    f"FROM {SCHEMA}.listings WHERE export_other = TRUE AND status = 'active' "
                    f"AND (is_visible IS NULL OR is_visible = TRUE) ORDER BY created_at DESC"
                )
                shared_listings = [dict(r) for r in cur.fetchall()]
                for f in feeds:
                    f['listings_count'] = len(shared_listings)
                    f['stats'] = None
                return _json({'platforms': feeds, 'listings': shared_listings})

            if method == 'GET' and action == 'youla_feed':
                return _json(_youla_feed_summary(cur))

            if method == 'POST' and action == 'youla_webhook':
                # Публичный вебхук Юлы (без подписи). Старый адрес xml-feeds пересылает сюда.
                return _youla_webhook(cur, conn, event)

            if method == 'GET' and action == 'youla_probe':
                # Диагностика (только чтение): статистика Юлы по одному номеру объявления.
                # Нужна, чтобы проверить, видит ли ключ объявления, созданные автозагрузкой (XML).
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'director'):
                    return _json({'error': 'Нет прав'}, 403)
                pid = re.sub(r'[^0-9a-f]', '', (params.get('product_id') or '').lower())[:40]
                if len(pid) != 24:
                    return _json({'error': 'Нужен product_id (24 символа из ссылки объявления)'}, 400)
                cur.execute(f"SELECT api_key FROM {SCHEMA}.ad_platform_keys WHERE platform = 'youla' LIMIT 1")
                kr = cur.fetchone()
                tok = ((kr or {}).get('api_key') or '').strip()
                if not tok:
                    return _json({'error': 'Ключ Юлы не задан'}, 400)
                now_dt = datetime.now(timezone.utc)
                prm = {'from': (now_dt - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ'),
                       'to': now_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}
                data, err = _youla_request('GET', f"/products/{pid}/statistic", tok, params=prm)
                return _json({'ok': err is None, 'product_id': pid, 'statistic': data, 'error': err})

            if method == 'POST' and action == 'youla_set_channel' and (json.loads(event.get('body') or '{}').get('channel') == 'api'):
                return _json({'error': 'Выгрузка на Юлу идёт только через XML-файл'}, 400)

            if method == 'POST' and action == 'youla_set_channel':
                # Ручная смена канала Юлы у объекта (единственный способ сменить канал).
                #  feed → api: объект уходит из файла (Юла снимет файловое объявление),
                #              старые API-номера забываются — будет создано новое объявление;
                #  api → feed: API-объявление уйдёт в архив при ближайшей синхронизации,
                #              объект попадёт в файл при следующей сборке фидов.
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'director'):
                    return _json({'error': 'Нет прав'}, 403)
                body = json.loads(event.get('body') or '{}')
                lid = int(body.get('listing_id') or 0)
                ch = body.get('channel')
                if not lid or ch not in ('feed', 'api'):
                    return _json({'error': 'Нужны listing_id и channel = feed|api'}, 400)
                if ch == 'api':
                    cur.execute(f"SELECT is_removed, is_archived, youla_id FROM {SCHEMA}.youla_item_status WHERE listing_id = %s", (lid,))
                    st = cur.fetchone()
                    if not st or st['is_removed'] or st['is_archived'] or not st['youla_id']:
                        cur.execute(f"UPDATE {SCHEMA}.listings SET youla_ad_id = NULL WHERE id = %s", (lid,))
                        cur.execute(f"DELETE FROM {SCHEMA}.youla_create_claims WHERE listing_id = %s", (lid,))
                        cur.execute(f"DELETE FROM {SCHEMA}.youla_item_status WHERE listing_id = %s", (lid,))
                cur.execute(f"UPDATE {SCHEMA}.listings SET youla_channel = %s WHERE id = %s RETURNING id", (ch, lid))
                ok = cur.fetchone() is not None
                conn.commit()
                if not ok:
                    return _json({'error': 'Объект не найден'}, 404)
                return _json({'ok': True, 'listing_id': lid, 'channel': ch})

            if method == 'POST' and action == 'youla_unexport_removed':
                # «Снять с выгрузки удалённые на Юле»: снимаем галочку «Юла» с объектов, чьи
                # объявления на Юле удалены (вручную или модерацией), и забываем старые номера.
                # Если галочку поставить снова — объект будет опубликован новым объявлением.
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'director'):
                    return _json({'error': 'Нет прав'}, 403)
                cur.execute(
                    f"SELECT s.listing_id FROM {SCHEMA}.youla_item_status s JOIN {SCHEMA}.listings l ON l.id = s.listing_id "
                    f"WHERE s.is_removed = TRUE AND s.recreate_requested IS NOT TRUE AND l.export_youla = TRUE "
                    f"AND l.youla_channel = 'api'"
                )
                ids = [r['listing_id'] for r in cur.fetchall()]
                if ids:
                    cur.execute(f"UPDATE {SCHEMA}.listings SET export_youla = FALSE, youla_ad_id = NULL WHERE id = ANY(%s)", (ids,))
                    cur.execute(f"DELETE FROM {SCHEMA}.youla_create_claims WHERE listing_id = ANY(%s)", (ids,))
                    cur.execute(f"DELETE FROM {SCHEMA}.youla_item_status WHERE listing_id = ANY(%s)", (ids,))
                conn.commit()
                return _json({'ok': True, 'unexported': len(ids), 'listing_ids': ids})

            if method == 'POST' and action in ('youla_recreate', 'youla_claim_reset'):
                user = _get_user(cur, _auth_token(event, params))
                if not user or user['role'] not in ('admin', 'director'):
                    return _json({'error': 'Нет прав'}, 403)
                body = json.loads(event.get('body') or '{}')
                if action == 'youla_recreate':
                    # Объявление удалено на Юле и НЕ было дублем — пересоздать при следующей синхронизации.
                    ids = [int(x) for x in (body.get('listing_ids') or []) if str(x).isdigit()]
                    if not ids:
                        return _json({'error': 'Не выбраны объекты'}, 400)
                    cur.execute(
                        f"UPDATE {SCHEMA}.youla_item_status SET recreate_requested = TRUE "
                        f"WHERE listing_id = ANY(%s) AND is_removed = TRUE AND is_blocked IS NOT TRUE "
                        f"AND listing_id IN (SELECT id FROM {SCHEMA}.listings WHERE youla_channel = 'api')", (ids,)
                    )
                    n = cur.rowcount
                    conn.commit()
                    return _json({'ok': True, 'marked': n})
                # «Отправить снова»: объявления с «Код объекта: N» на Юле нет — снимаем отметку.
                lid = int(body.get('listing_id') or 0)
                cur.execute(f"DELETE FROM {SCHEMA}.youla_create_claims WHERE listing_id = %s AND youla_id IS NULL", (lid,))
                n = cur.rowcount
                conn.commit()
                return _json({'ok': True, 'reset': n})

            return _json({'error': 'Неизвестное действие'}, 400)
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        if is_rate_limit(e):
            print(f'[platform-sync] rate limit: action={action}')
            return busy_response()
        print(f'[platform-sync] unhandled error: {type(e).__name__}: {e}\n{traceback.format_exc()}')
        return _json({'error': f'Internal error: {type(e).__name__}: {str(e)[:300]}'}, 500)
    finally:
        conn.close()
