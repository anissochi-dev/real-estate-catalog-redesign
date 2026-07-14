"""
Крон-функция: ежедневный пересчёт индексации (CAGR) арендных ставок по категориям
объектов на основе реальных снимков рынка price_market_snapshots (собираются
автоматически market-snapshots парсером с arrpro/ayax/etagi/moreon каждый день).

Результат кладётся в avg_indexation_cache — noi_model.py читает готовый кэш вместо
живого пересчёта на каждый запрос инвестмодели.

Запуск:
  - Клиентский пинг (action=ping_cron) из news/index.py — вызывается при заходе
    посетителя на сайт, срабатывает раз в сутки в окне settings.indexation_cron_hour/
    minute (UTC!). По умолчанию 22:30 UTC = 01:30 МСК.
  - Ручной запуск (action=run) для проверки из админки — игнорирует расписание,
    пересчитывает сразу.

ВАЖНО про часовой пояс: indexation_cron_hour/minute хранятся и сравниваются в UTC
(now_utc из datetime.now(timezone.utc)). МСК = UTC+3, поэтому для запуска в 01:30 МСК
нужно ставить indexation_cron_hour=22, indexation_cron_minute=30.
"""
import json
import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p71821556_real_estate_catalog_')

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Authorization',
}

# Категории и типы сделок, для которых считаем индексацию (совпадают с noi_model.py)
CATEGORIES = [
    'office', 'retail', 'warehouse', 'restaurant', 'hotel', 'gab',
    'business', 'production', 'building', 'free_purpose', 'car_service', 'land',
]

MIN_DAYS_SPAN = 365       # минимум 1 год между первой и последней точкой
MIN_ANALOGS_PER_POINT = 3  # точка снапшота должна опираться минимум на 3 аналога


def _get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=psycopg2.extras.RealDictCursor)


def _ok(body, status=200):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'},
            'body': json.dumps(body, ensure_ascii=False)}


def _compute_category(cur, category: str) -> dict | None:
    """
    Считает CAGR арендной ставки по категории на основе price_market_snapshots
    (district = '' — общегородская агрегация). Если аренды недостаточно —
    использует продажу как консервативный прокси (умножается на 0.6, как раньше
    для price_history_biweekly).
    """
    for deal in ('rent', 'sale'):
        cur.execute(
            f"SELECT snapshot_date, price_per_m2_median FROM {SCHEMA}.price_market_snapshots "
            f"WHERE category = %s AND deal = %s AND district = '' "
            f"AND price_per_m2_median IS NOT NULL AND price_per_m2_median > 0 "
            f"AND analogs_count >= %s "
            f"ORDER BY snapshot_date ASC LIMIT 1",
            (category, deal, MIN_ANALOGS_PER_POINT),
        )
        first = cur.fetchone()
        cur.execute(
            f"SELECT snapshot_date, price_per_m2_median FROM {SCHEMA}.price_market_snapshots "
            f"WHERE category = %s AND deal = %s AND district = '' "
            f"AND price_per_m2_median IS NOT NULL AND price_per_m2_median > 0 "
            f"AND analogs_count >= %s "
            f"ORDER BY snapshot_date DESC LIMIT 1",
            (category, deal, MIN_ANALOGS_PER_POINT),
        )
        last = cur.fetchone()
        if first and last and first['snapshot_date'] != last['snapshot_date']:
            break
    else:
        return None

    p0 = float(first['price_per_m2_median'])
    p1 = float(last['price_per_m2_median'])
    if p0 <= 0 or p1 <= 0:
        return None

    days = (last['snapshot_date'] - first['snapshot_date']).days
    if days < MIN_DAYS_SPAN:
        return None

    years = days / 365.25
    cagr = ((p1 / p0) ** (1 / years) - 1) * 100
    if deal == 'sale':
        # Ставки аренды исторически растут медленнее цен продажи — консервативный прокси
        cagr = cagr * 0.6
    # Реалистичный диапазон индексации арендной ставки: 3-12%
    cagr = max(3.0, min(12.0, round(cagr, 1)))

    return {
        'category': category, 'deal': deal, 'avg_indexation_pct': cagr,
        'price_first': p0, 'price_last': p1,
        'date_first': str(first['snapshot_date']), 'date_last': str(last['snapshot_date']),
        'days_span': days,
    }


def _run_recompute(cur, conn) -> dict:
    computed, skipped = [], []
    for cat in CATEGORIES:
        res = _compute_category(cur, cat)
        if res:
            cur.execute(
                f"INSERT INTO {SCHEMA}.avg_indexation_cache "
                f"(category, deal, avg_indexation_pct, price_first, price_last, date_first, date_last, days_span, computed_at) "
                f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
                f"ON CONFLICT (category, deal) DO UPDATE SET "
                f"avg_indexation_pct = EXCLUDED.avg_indexation_pct, price_first = EXCLUDED.price_first, "
                f"price_last = EXCLUDED.price_last, date_first = EXCLUDED.date_first, "
                f"date_last = EXCLUDED.date_last, days_span = EXCLUDED.days_span, computed_at = NOW()",
                (res['category'], res['deal'], res['avg_indexation_pct'], res['price_first'],
                 res['price_last'], res['date_first'], res['date_last'], res['days_span']),
            )
            computed.append(res)
        else:
            skipped.append(cat)
    conn.commit()

    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
    status = json.dumps({'computed': len(computed), 'skipped': skipped}, ensure_ascii=False).replace("'", "''")
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET indexation_cron_last_at = '{ts}', "
        f"indexation_cron_last_status = '{status}'::jsonb "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id LIMIT 1)"
    )
    conn.commit()

    print(f'[indexation-cron] computed={len(computed)} skipped={len(skipped)}: {skipped}')
    return {'ok': True, 'computed': computed, 'skipped_categories': skipped}


def handler(event: dict, context) -> dict:
    """
    Пересчитывает индексацию (CAGR) арендных ставок по категориям на основе
    реальных ежедневных снимков рынка. Запускается по расписанию (01:30) через
    серверный триггер платформы или клиентский пинг из общей крон-цепочки.
    """
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    params = event.get('queryStringParameters') or {}
    body_raw = event.get('body') or '{}'
    try:
        body = json.loads(body_raw) if isinstance(body_raw, str) else (body_raw or {})
    except Exception:
        body = {}
    action = params.get('action') or body.get('action') or 'run'

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            if action == 'ping_cron':
                cur.execute(
                    f"SELECT indexation_cron_enabled, indexation_cron_hour, indexation_cron_minute, "
                    f"indexation_cron_last_at FROM {SCHEMA}.settings ORDER BY id LIMIT 1"
                )
                s = cur.fetchone() or {}
                if not s.get('indexation_cron_enabled', True):
                    return _ok({'skipped': True, 'reason': 'disabled'})

                now_utc = datetime.now(timezone.utc)
                target_hour = int(s.get('indexation_cron_hour') or 1)
                target_minute = int(s.get('indexation_cron_minute') or 30)
                last_at = s.get('indexation_cron_last_at')
                already_ran = last_at and hasattr(last_at, 'date') and last_at.date() >= now_utc.date()
                time_ok = now_utc.hour == target_hour and abs(now_utc.minute - target_minute) <= 30

                if not time_ok or already_ran:
                    return _ok({'skipped': True, 'time_ok': time_ok, 'already_ran': already_ran})

                result = _run_recompute(cur, conn)
                return _ok(result)

            # action == 'run' — ручной пересчёт (админка/тест)
            result = _run_recompute(cur, conn)
            return _ok(result)
    finally:
        conn.close()