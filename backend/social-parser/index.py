"""
social-parser — парсер объявлений о коммерческой недвижимости из соцсетей.

Платформы: ВКонтакте, Одноклассники, Telegram (публичные каналы).
Найденные объявления сохраняются в market_listings.

Actions (POST body {action: ...}):
  run          — запустить парсинг (platform: vk|ok|telegram|all)
  cron         — автозапуск по расписанию (без авторизации, парсит Telegram)
  sources_list — список настроенных источников
  sources_add  — добавить источник
  sources_del  — удалить источник
  sessions_list — список сессий (куки)
  sessions_add  — добавить/обновить сессию (куки VK/OK)
  sessions_del  — удалить сессию
  log           — история запусков
  test_post     — проверить текст на наличие объявления (без сохранения)
"""

import json
import os

import psycopg2

from core import (
    ok, err, cors_ok, check_auth, get_conn,
    parse_post_text, is_realestate_post,
    SCHEMA,
)
from adapter_vk import run_vk
from adapter_ok import run_ok
from adapter_tg import run_telegram


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

    # ── CRON: Telegram без авторизации ────────────────────────────────────────
    if action == 'cron':
        conn = get_conn()
        try:
            result = run_telegram(conn, max_posts_per_source=30)
            return ok({'success': True, **result})
        finally:
            conn.close()

    # ── Авторизация для всех остальных действий ───────────────────────────────
    user = check_auth(event)
    if not user:
        return err('Нет доступа', 401)

    conn = get_conn()
    try:
        return _dispatch(action, body, conn)
    finally:
        conn.close()


def _dispatch(action: str, body: dict, conn) -> dict:
    """Маршрутизирует запросы по action."""

    # ── ЗАПУСК ПАРСИНГА ───────────────────────────────────────────────────────

    if action == 'run':
        platform = body.get('platform', 'all')
        max_posts = int(body.get('max_posts', 50))
        results = {}

        if platform in ('vk', 'all'):
            results['vk'] = run_vk(conn, max_posts_per_source=max_posts)

        if platform in ('ok', 'all'):
            results['ok'] = run_ok(conn, max_posts_per_source=max_posts)

        if platform in ('telegram', 'all'):
            results['telegram'] = run_telegram(conn, max_posts_per_source=max_posts)

        if not results:
            return err(f'Неизвестная платформа: {platform}')

        total_saved = sum(
            r.get('total_saved', 0) for r in results.values()
            if isinstance(r, dict)
        )
        return ok({'success': True, 'total_saved': total_saved, 'details': results})

    # ── ИСТОЧНИКИ ─────────────────────────────────────────────────────────────

    if action == 'sources_list':
        platform = body.get('platform') or ''
        cur = conn.cursor()
        if platform:
            cur.execute(
                f"SELECT * FROM {SCHEMA}.social_parser_sources "
                f"WHERE platform=%s ORDER BY platform, title",
                (platform,)
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
            return err('platform должен быть vk, ok или telegram')

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
        source_db_id = body.get('id')
        if not source_db_id:
            return err('Укажите id источника')
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.social_parser_sources SET is_active=FALSE WHERE id=%s",
            (source_db_id,)
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
        cookies  = body.get('cookies')  # dict или JSON-строка
        phone    = (body.get('phone') or '').strip() or None

        if not platform:
            return err('Укажите platform')
        if platform not in ('vk', 'ok', 'telegram'):
            return err('platform должен быть vk, ok или telegram')

        # Нормализуем куки в JSON-строку
        cookies_str = None
        if cookies:
            if isinstance(cookies, dict):
                import json as _json
                cookies_str = _json.dumps(cookies, ensure_ascii=False)
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
            (platform, label, cookies_str, phone,
             cookies_str, phone)
        )
        conn.commit()
        cur.close()
        return ok({'success': True, 'platform': platform, 'label': label})

    if action == 'sessions_del':
        session_id = body.get('id')
        if not session_id:
            return err('Укажите id сессии')
        cur = conn.cursor()
        cur.execute(
            f"UPDATE {SCHEMA}.social_sessions SET is_active=FALSE WHERE id=%s",
            (session_id,)
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
                f"ORDER BY started_at DESC LIMIT %s",
                (limit,)
            )
        rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'log': rows})

    # ── ТЕСТ ТЕКСТА ───────────────────────────────────────────────────────────

    if action == 'test_post':
        text = body.get('text', '')
        if not text:
            return err('Укажите text')
        is_ad = is_realestate_post(text)
        parsed = parse_post_text(text, 'test', 'test_0', '') if is_ad else None
        return ok({
            'is_realestate': is_ad,
            'parsed': parsed,
        })

    # ── СТАТИСТИКА ────────────────────────────────────────────────────────────

    if action == 'stats':
        cur = conn.cursor()
        cur.execute(
            f"SELECT platform, COUNT(*) as cnt, "
            f"SUM(posts_found) as total_found, SUM(posts_saved) as total_saved, "
            f"MAX(started_at) as last_run "
            f"FROM {SCHEMA}.social_parser_log "
            f"GROUP BY platform ORDER BY platform"
        )
        platform_stats = [dict(r) for r in cur.fetchall()]

        cur.execute(
            f"SELECT source, COUNT(*) as cnt, MAX(scraped_at) as last_scraped "
            f"FROM {SCHEMA}.market_listings "
            f"WHERE source IN ('vk','ok','telegram') "
            f"GROUP BY source ORDER BY source"
        )
        market_stats = [dict(r) for r in cur.fetchall()]
        cur.close()
        return ok({'platform_stats': platform_stats, 'market_stats': market_stats})

    return err(f'Неизвестный action: {action}')
