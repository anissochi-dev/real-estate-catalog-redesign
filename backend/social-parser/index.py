"""
social-parser — парсер объявлений о коммерческой недвижимости из соцсетей.

Платформы: ВКонтакте, Одноклассники, Telegram (публичные каналы).
Найденные посты сохраняются в social_posts → очередь модерации.
После одобрения брокером → leads (заявки) или listings (объекты).

Actions:
  cron            — автозапуск по критериям (без авторизации)
  run             — ручной запуск (platform: vk|ok|telegram|all)
  criteria_list   — список критериев поиска
  criteria_add    — создать критерий
  criteria_edit   — изменить критерий
  criteria_toggle — вкл/выкл критерий
  criteria_run    — запустить конкретный критерий
  queue_list      — очередь модерации (status=pending)
  queue_approve   — одобрить пост → leads или listings
  queue_reject    — отклонить пост
  queue_stats     — статистика очереди
  sources_list / sources_add / sources_del
  sessions_list / sessions_add / sessions_del
  log             — история запусков
  test_post       — проверить текст поста (без сохранения)
  stats           — общая статистика
"""

import json

from core import (
    ok, err, cors_ok, check_auth, get_conn,
    parse_post_text, is_realestate_post,
    get_active_criteria, update_criteria_run_time,
    SCHEMA,
)
from adapter_vk import run_vk
from adapter_ok import run_ok
from adapter_tg import run_telegram
from router import route_to_leads, route_to_listings, route_to_market, reject_post


# ═══════════════════════════════════════════════════════════════════════════════
# HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

def handler(event: dict, context) -> dict:
    """Парсер объявлений о коммерческой недвижимости из соцсетей (VK, OK, Telegram)."""
    if event.get('httpMethod') == 'OPTIONS':
        return cors_ok()

    try:
        body = json.loads(event.get('body') or '{}')
    except Exception:
        return err('Invalid JSON body')

    params = event.get('queryStringParameters') or {}
    action = body.get('action') or params.get('action') or ''

    # ── CRON: запуск по активным критериям, без авторизации ───────────────────
    if action == 'cron':
        conn = get_conn()
        try:
            criteria_list = get_active_criteria(conn)
            if not criteria_list:
                return ok({'success': True, 'message': 'Нет критериев для запуска', 'total_saved': 0})

            total_saved = 0
            details = []

            for criteria in criteria_list:
                platforms = criteria.get('platforms') or []
                res = _run_by_criteria(conn, criteria, platforms)
                total_saved += res.get('total_saved', 0)
                details.append({'criteria_id': criteria['id'], 'title': criteria['title'], **res})
                update_criteria_run_time(conn, criteria['id'])

            return ok({'success': True, 'total_saved': total_saved, 'details': details})
        finally:
            conn.close()

    # ── Авторизация для всех остальных ────────────────────────────────────────
    user = check_auth(event)
    if not user:
        return err('Нет доступа', 401)

    conn = get_conn()
    try:
        return _dispatch(action, body, conn, user)
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# ДИСПЕТЧЕР
# ═══════════════════════════════════════════════════════════════════════════════

def _dispatch(action: str, body: dict, conn, user: dict) -> dict:

    # ── РУЧНОЙ ЗАПУСК ─────────────────────────────────────────────────────────

    if action == 'run':
        platform   = body.get('platform', 'all')
        max_posts  = int(body.get('max_posts', 50))
        criteria_id = body.get('criteria_id')

        criteria = None
        if criteria_id:
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM {SCHEMA}.social_search_criteria WHERE id=%s", (criteria_id,))
            row = cur.fetchone()
            criteria = dict(row) if row else None
            cur.close()

        platforms = [platform] if platform != 'all' else ['vk', 'ok', 'telegram']
        if criteria:
            platforms = [p for p in (criteria.get('platforms') or platforms) if p in platforms]

        result = _run_by_criteria(conn, criteria, platforms, max_posts)
        if criteria:
            update_criteria_run_time(conn, criteria_id)
        return ok({'success': True, **result})

    if action == 'criteria_run':
        cid = body.get('id')
        if not cid:
            return err('Укажите id критерия')
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM {SCHEMA}.social_search_criteria WHERE id=%s", (cid,))
        row = cur.fetchone()
        cur.close()
        if not row:
            return err('Критерий не найден')
        criteria = dict(row)
        result = _run_by_criteria(conn, criteria, criteria.get('platforms') or ['telegram'])
        update_criteria_run_time(conn, cid)
        return ok({'success': True, **result})

    # ── КРИТЕРИИ ПОИСКА ───────────────────────────────────────────────────────

    if action == 'criteria_list':
        cur = conn.cursor()
        cur.execute(
            f"SELECT c.*, "
            f"(SELECT COUNT(*) FROM {SCHEMA}.social_posts p "
            f" WHERE p.criteria_id=c.id AND p.status='pending') as pending_count "
            f"FROM {SCHEMA}.social_search_criteria c "
            f"ORDER BY c.is_active DESC, c.created_at DESC"
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'criteria': rows})

    if action == 'criteria_add':
        return _criteria_save(conn, body, user, None)

    if action == 'criteria_edit':
        cid = body.get('id')
        if not cid:
            return err('Укажите id критерия')
        return _criteria_save(conn, body, user, cid)

    if action == 'criteria_toggle':
        cid = body.get('id')
        if not cid:
            return err('Укажите id критерия')
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.social_search_criteria "
            f"SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING is_active",
            (cid,)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return ok({'success': True, 'is_active': row['is_active'] if row else None})

    # ── ОЧЕРЕДЬ МОДЕРАЦИИ ─────────────────────────────────────────────────────

    if action == 'queue_list':
        platform = body.get('platform') or ''
        status   = body.get('status') or 'pending'
        limit    = min(int(body.get('limit', 20)), 100)
        offset   = int(body.get('offset', 0))

        cur = conn.cursor()
        where = f"status='{status}'"
        if platform:
            where += f" AND platform='{platform}'"

        cur.execute(
            f"SELECT * FROM {SCHEMA}.social_posts "
            f"WHERE {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (limit, offset)
        )
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) as cnt FROM {SCHEMA}.social_posts WHERE {where}")
        total = int((cur.fetchone() or {}).get('cnt') or 0)
        cur.close()
        return ok({'posts': rows, 'total': total, 'offset': offset, 'limit': limit})

    if action == 'queue_stats':
        cur = conn.cursor()
        cur.execute(
            f"SELECT platform, status, COUNT(*) as cnt "
            f"FROM {SCHEMA}.social_posts "
            f"GROUP BY platform, status ORDER BY platform, status"
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT COUNT(*) as pending FROM {SCHEMA}.social_posts WHERE status='pending'"
        )
        pending = int((cur.fetchone() or {}).get('pending') or 0)
        cur.close()
        return ok({'by_platform': rows, 'total_pending': pending})

    if action == 'queue_approve':
        post_id  = body.get('post_id')
        route    = body.get('route', 'leads')   # leads | listings | market
        override = body.get('override') or {}

        if not post_id:
            return err('Укажите post_id')
        if route not in ('leads', 'listings', 'market'):
            return err('route должен быть leads, listings или market')

        cur = conn.cursor()
        cur.execute(
            f"SELECT * FROM {SCHEMA}.social_posts WHERE id=%s AND status='pending'",
            (post_id,)
        )
        row = cur.fetchone()
        cur.close()

        if not row:
            return err('Пост не найден или уже обработан')

        post = dict(row)

        if route == 'leads':
            result_id = route_to_leads(conn, post, user['id'], override)
            return ok({'success': True, 'route': 'leads', 'lead_id': result_id})

        if route == 'listings':
            result_id = route_to_listings(conn, post, user['id'], override)
            return ok({'success': True, 'route': 'listings', 'listing_id': result_id})

        if route == 'market':
            result_id = route_to_market(conn, post, user['id'])
            return ok({'success': True, 'route': 'market', 'market_id': result_id})

    if action == 'queue_reject':
        post_id = body.get('post_id')
        reason  = body.get('reason', '')
        if not post_id:
            return err('Укажите post_id')
        success = reject_post(conn, int(post_id), user['id'], reason)
        return ok({'success': success})

    # ── ИСТОЧНИКИ ─────────────────────────────────────────────────────────────

    if action == 'sources_list':
        platform = body.get('platform') or ''
        cur = conn.cursor()
        if platform:
            cur.execute(
                f"SELECT * FROM {SCHEMA}.social_parser_sources "
                f"WHERE platform=%s ORDER BY platform, title", (platform,)
            )
        else:
            cur.execute(
                f"SELECT * FROM {SCHEMA}.social_parser_sources ORDER BY platform, title"
            )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'sources': rows})

    if action == 'sources_add':
        platform   = (body.get('platform') or '').strip()
        source_id  = (body.get('source_id') or '').strip()
        source_url = (body.get('source_url') or '').strip()
        title      = (body.get('title') or source_id).strip()

        if not platform or not source_id:
            return err('Укажите platform и source_id')
        if platform not in ('vk', 'ok', 'telegram'):
            return err('platform: vk, ok или telegram')

        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO {SCHEMA}.social_parser_sources "
            f"(platform, source_id, source_url, title, is_active) "
            f"VALUES (%s,%s,%s,%s,TRUE) "
            f"ON CONFLICT (platform, source_id) DO UPDATE SET "
            f"source_url=%s, title=%s, is_active=TRUE",
            (platform, source_id, source_url or None, title,
             source_url or None, title)
        )
        conn.commit()
        cur.close()
        return ok({'success': True, 'platform': platform, 'source_id': source_id})

    if action == 'sources_del':
        sid = body.get('id')
        if not sid:
            return err('Укажите id')
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.social_parser_sources SET is_active=FALSE WHERE id=%s", (sid,)
        )
        conn.commit()
        cur.close()
        return ok({'success': True})

    # ── СЕССИИ (КУКИ) ─────────────────────────────────────────────────────────

    if action == 'sessions_list':
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, platform, label, is_active, is_blocked, blocked_until, "
            f"requests_today, requests_hour, last_request_at, updated_at "
            f"FROM {SCHEMA}.social_sessions ORDER BY platform, label"
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'sessions': rows})

    if action == 'sessions_add':
        platform = (body.get('platform') or '').strip()
        label    = (body.get('label') or 'default').strip()
        cookies  = body.get('cookies')
        phone    = (body.get('phone') or '').strip() or None

        if not platform or platform not in ('vk', 'ok', 'telegram'):
            return err('platform: vk, ok или telegram')

        cookies_str = None
        if cookies:
            if isinstance(cookies, dict):
                cookies_str = json.dumps(cookies, ensure_ascii=False)
            elif isinstance(cookies, str):
                cookies_str = cookies

        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO {SCHEMA}.social_sessions "
            f"(platform, label, cookies, phone, is_active, is_blocked) "
            f"VALUES (%s,%s,%s,%s,TRUE,FALSE) "
            f"ON CONFLICT (platform, label) DO UPDATE SET "
            f"cookies=%s, phone=%s, is_active=TRUE, is_blocked=FALSE, "
            f"requests_today=0, requests_hour=0, updated_at=NOW()",
            (platform, label, cookies_str, phone, cookies_str, phone)
        )
        conn.commit()
        cur.close()
        return ok({'success': True, 'platform': platform, 'label': label})

    if action == 'sessions_del':
        sid = body.get('id')
        if not sid:
            return err('Укажите id')
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.social_sessions SET is_active=FALSE WHERE id=%s", (sid,)
        )
        conn.commit()
        cur.close()
        return ok({'success': True})

    # ── ИСТОРИЯ ───────────────────────────────────────────────────────────────

    if action == 'log':
        platform = body.get('platform') or ''
        limit    = min(int(body.get('limit', 50)), 200)
        cur = conn.cursor()
        if platform:
            cur.execute(
                f"SELECT * FROM {SCHEMA}.social_parser_log "
                f"WHERE platform=%s ORDER BY started_at DESC LIMIT %s",
                (platform, limit)
            )
        else:
            cur.execute(
                f"SELECT * FROM {SCHEMA}.social_parser_log "
                f"ORDER BY started_at DESC LIMIT %s", (limit,)
            )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'log': rows})

    # ── ТЕСТ ТЕКСТА ───────────────────────────────────────────────────────────

    if action == 'test_post':
        text = body.get('text', '')
        if not text:
            return err('Укажите text')
        is_ad  = is_realestate_post(text)
        parsed = parse_post_text(text, 'test', 'test_0', '') if is_ad else None
        return ok({'is_realestate': is_ad, 'parsed': parsed})

    # ── СТАТИСТИКА ────────────────────────────────────────────────────────────

    if action == 'stats':
        cur = conn.cursor()
        cur.execute(
            f"SELECT platform, COUNT(*) as cnt, "
            f"SUM(posts_found) as total_found, SUM(posts_saved) as total_saved, "
            f"MAX(started_at) as last_run "
            f"FROM {SCHEMA}.social_parser_log GROUP BY platform ORDER BY platform"
        )
        platform_stats = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"SELECT status, COUNT(*) as cnt "
            f"FROM {SCHEMA}.social_posts GROUP BY status"
        )
        queue_stats = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"SELECT COUNT(*) as cnt FROM {SCHEMA}.social_search_criteria WHERE is_active=TRUE"
        )
        active_criteria = int((cur.fetchone() or {}).get('cnt') or 0)

        cur.close()
        return ok({
            'platform_stats':  platform_stats,
            'queue_stats':     queue_stats,
            'active_criteria': active_criteria,
        })

    return err(f'Неизвестный action: {action}')


# ═══════════════════════════════════════════════════════════════════════════════
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ═══════════════════════════════════════════════════════════════════════════════

def _run_by_criteria(conn, criteria: dict | None, platforms: list[str],
                     max_posts: int = 50) -> dict:
    """Запускает парсинг по платформам с учётом критерия."""
    results = {}
    total_saved = 0

    if 'vk' in platforms:
        results['vk'] = run_vk(conn, criteria=criteria, max_posts_per_source=max_posts)
        total_saved += results['vk'].get('total_saved', 0)

    if 'ok' in platforms:
        results['ok'] = run_ok(conn, criteria=criteria, max_posts_per_source=max_posts)
        total_saved += results['ok'].get('total_saved', 0)

    if 'telegram' in platforms:
        results['telegram'] = run_telegram(conn, criteria=criteria, max_posts_per_source=max_posts)
        total_saved += results['telegram'].get('total_saved', 0)

    return {'total_saved': total_saved, 'details': results}


def _criteria_save(conn, body: dict, user: dict, criteria_id) -> dict:
    """Создаёт или обновляет критерий поиска."""
    title = (body.get('title') or '').strip()
    if not title:
        return err('Укажите название критерия')

    platforms        = body.get('platforms') or ['telegram']
    source_ids       = body.get('source_ids') or []
    keywords_include = body.get('keywords_include') or []
    keywords_exclude = body.get('keywords_exclude') or []
    deal_types       = body.get('deal_types') or []
    categories       = body.get('categories') or []
    price_min        = body.get('price_min') or None
    price_max        = body.get('price_max') or None
    area_min         = body.get('area_min') or None
    area_max         = body.get('area_max') or None
    districts        = body.get('districts') or []
    require_price    = bool(body.get('require_price', False))
    require_area     = bool(body.get('require_area', False))
    require_phone    = bool(body.get('require_phone', False))
    require_photo    = bool(body.get('require_photo', False))
    require_address  = bool(body.get('require_address', False))
    route_to         = body.get('route_to') or 'moderation'
    interval         = int(body.get('run_interval_hours') or 6)
    is_active        = bool(body.get('is_active', True))

    if route_to not in ('moderation', 'leads', 'listings', 'market'):
        return err('route_to: moderation, leads, listings или market')

    cur = conn.cursor()

    if criteria_id:
        cur.execute(
            f"UPDATE {SCHEMA}.social_search_criteria SET "
            f"title=%s, is_active=%s, platforms=%s, source_ids=%s, "
            f"keywords_include=%s, keywords_exclude=%s, "
            f"deal_types=%s, categories=%s, "
            f"price_min=%s, price_max=%s, area_min=%s, area_max=%s, districts=%s, "
            f"require_price=%s, require_area=%s, require_phone=%s, "
            f"require_photo=%s, require_address=%s, "
            f"route_to=%s, run_interval_hours=%s, updated_at=NOW() "
            f"WHERE id=%s RETURNING id",
            (title, is_active, platforms, source_ids,
             keywords_include, keywords_exclude,
             deal_types, categories,
             price_min, price_max, area_min, area_max, districts,
             require_price, require_area, require_phone,
             require_photo, require_address,
             route_to, interval, criteria_id)
        )
    else:
        cur.execute(
            f"INSERT INTO {SCHEMA}.social_search_criteria "
            f"(title, is_active, platforms, source_ids, "
            f"keywords_include, keywords_exclude, "
            f"deal_types, categories, "
            f"price_min, price_max, area_min, area_max, districts, "
            f"require_price, require_area, require_phone, "
            f"require_photo, require_address, "
            f"route_to, run_interval_hours, created_by) "
            f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            f"RETURNING id",
            (title, is_active, platforms, source_ids,
             keywords_include, keywords_exclude,
             deal_types, categories,
             price_min, price_max, area_min, area_max, districts,
             require_price, require_area, require_phone,
             require_photo, require_address,
             route_to, interval, user['id'])
        )

    row = cur.fetchone()
    conn.commit()
    cur.close()
    return ok({'success': True, 'id': row['id'] if row else criteria_id})
