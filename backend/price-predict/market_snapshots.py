"""Рыночные снапшоты цен: сбор, хранение и выдача для графиков.

Батчевая стратегия (укладываемся в таймаут 30 сек):
  Каждый вызов handle_refresh() обрабатывает ОДИН источник данных:
    batch 0 → база системы (быстро, < 2 сек)
    batch 1 → arrpro.ru — целевой обход ВСЕХ комбинаций категория+сделка
    batch 2 → ayax.ru — целевой обход ВСЕХ комбинаций категория+сделка
    batch 3 → etagi.com — целевой обход ВСЕХ комбинаций категория+сделка
    batch 4 → moreon-invest.ru (продажа + аренда, сайт без разбивки по категориям)
    batch 5 → финализация (merge + commit снапшотов)

  ВАЖНО: batch 1-3 используют ТЕ ЖЕ точные целевые функции (analogs_fetcher.py),
  что и «Виртуальный брокер» и инвестиционная модель — с правильными URL по каждой
  категории+сделке. Каждый батч проходит по ВСЕМ активным комбинациям категория+сделка
  (а не только по одной "office/rent" как было раньше), и сразу сохраняет найденное
  в market_listings — общую копилку для всех инструментов сравнения с рынком.

  Прогресс хранится в settings.price_refresh_status (JSONB):
    {
      "in_progress": true,
      "started_at": "2026-06-04",
      "next_batch": 1,
      "pool": {"office|rent|": [...], "office|rent|Центральный": [...]},
      "site_saved": {"arrpro": 120, "ayax": 45}
    }

  При ping_cron: если in_progress → продолжаем батч.
  Если все 6 батчей завершены → сохраняем снапшоты, обновляем last_at.
  Если не in_progress и прошло >= interval_days → стартуем batch 0.
"""
import datetime
import json
import statistics

SCHEMA = 't_p71821556_real_estate_catalog_'

BATCH_SOURCES = ['db', 'arrpro', 'ayax', 'etagi', 'moreon', 'finalize']

CATEGORY_SAMPLE_AREA = {
    'office': 100, 'retail': 150, 'warehouse': 500,
    'building': 800, 'free_purpose': 120, 'production': 400,
    'business': 200, 'hotel': 1000, 'land': 10,
    'restaurant': 150, 'gab': 300, 'car_service': 200,
}


# ── Динамические списки из БД ─────────────────────────────────────────────────

def _get_active_combos(cur):
    cur.execute(f"""
        SELECT DISTINCT category, deal
        FROM {SCHEMA}.listings
        WHERE status IN ('active', 'archived') AND category IS NOT NULL AND deal IS NOT NULL
        ORDER BY category, deal
    """)
    return [(r['category'], r['deal']) for r in cur.fetchall()]


def _get_active_districts(cur):
    """Берём районы из справочника districts (синхронизировано с разделом Районы в админке)."""
    cur.execute(f"""
        SELECT name FROM {SCHEMA}.districts
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, name ASC
    """)
    return [r['name'] for r in cur.fetchall()]


# ── Утилиты ───────────────────────────────────────────────────────────────────

def _pool_key(category, deal, district=''):
    return f'{category}|{deal}|{district}'


def _calc_snapshot(analogs):
    ppm2 = [a['price_per_m2'] for a in analogs if a.get('price_per_m2', 0) > 0]
    prices = [a['price'] for a in analogs if a.get('price', 0) > 0]
    if not ppm2:
        return None
    srt = sorted(ppm2)
    lo = srt[int(len(srt) * 0.1)]
    hi = srt[min(int(len(srt) * 0.9), len(srt) - 1)]
    filtered = [p for p in srt if lo <= p <= hi] or srt
    ps = sorted(prices)
    return {
        'price_per_m2_median': round(statistics.median(filtered), 2),
        'price_median': round(statistics.median(ps), 2) if ps else None,
        'price_min': ps[0] if ps else None,
        'price_max': ps[-1] if ps else None,
        'analogs_count': len(analogs),
        'sources': list({a.get('source', '') for a in analogs if a.get('source')}),
    }


def _save_snapshot(cur, today, category, deal, district, snap):
    src_json = json.dumps(snap['sources'], ensure_ascii=False).replace("'", "''")
    dist_safe = district.replace("'", "''")
    pm   = snap['price_median']
    pmin = snap['price_min']
    pmax = snap['price_max']
    cur.execute(f"""
        INSERT INTO {SCHEMA}.price_market_snapshots
            (snapshot_date, category, deal, district,
             price_median, price_min, price_max, price_per_m2_median,
             analogs_count, sources)
        VALUES ('{today}', '{category}', '{deal}', '{dist_safe}',
                {pm if pm is not None else 'NULL'},
                {pmin if pmin is not None else 'NULL'},
                {pmax if pmax is not None else 'NULL'},
                {snap['price_per_m2_median']}, {snap['analogs_count']}, '{src_json}')
        ON CONFLICT (snapshot_date, category, deal, district)
        DO UPDATE SET
            price_median        = EXCLUDED.price_median,
            price_min           = EXCLUDED.price_min,
            price_max           = EXCLUDED.price_max,
            price_per_m2_median = EXCLUDED.price_per_m2_median,
            analogs_count       = EXCLUDED.analogs_count,
            sources             = EXCLUDED.sources,
            created_at          = NOW()
    """)


def _load_status(cur):
    cur.execute(
        f"SELECT price_refresh_last_at, price_refresh_interval_days, "
        f"price_refresh_enabled, price_refresh_status "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    row = cur.fetchone()
    return dict(row) if row else {}


def _save_status(cur, conn, status_dict):
    js = json.dumps(status_dict, ensure_ascii=False).replace("'", "''")
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET price_refresh_status = '{js}'::jsonb "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
    )
    conn.commit()


def _update_last_at(cur, conn):
    cur.execute(
        f"UPDATE {SCHEMA}.settings "
        f"SET price_refresh_last_at = NOW(), price_refresh_status = '{{}}'::jsonb "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
    )
    conn.commit()


# ── Батчи ─────────────────────────────────────────────────────────────────────

def _batch_db(cur, combos, districts):
    """Батч 0: один широкий SELECT всех объявлений, группировка в Python.
    Заменяет цикл из тысяч отдельных запросов — укладывается в таймаут 30 сек.
    """
    cur.execute(f"""
        SELECT id, category, deal, price, area, price_per_m2, district, status
        FROM {SCHEMA}.listings
        WHERE status IN ('active', 'archived')
          AND price > 0 AND area > 0
          AND category IS NOT NULL AND deal IS NOT NULL
        ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 50000
    """)
    rows = cur.fetchall()
    print(f'[price_refresh] batch_db: loaded {len(rows)} listings from DB')

    # Индексируем по category|deal для быстрого поиска
    by_cat_deal = {}
    for r in rows:
        cat  = r['category'] or ''
        deal = r['deal'] or ''
        key  = f'{cat}|{deal}'
        if key not in by_cat_deal:
            by_cat_deal[key] = []
        by_cat_deal[key].append(r)

    def _to_analog(r):
        p = float(r['price'] or 0)
        a = float(r['area'] or 0)
        if p <= 0 or a <= 0:
            return None
        ppm2 = float(r['price_per_m2'] or 0) or round(p / a)
        return {
            'source': 'база системы',
            'price': p, 'area': a, 'price_per_m2': ppm2,
            'district': str(r.get('district') or ''),
            'url': '', 'status': str(r.get('status') or ''),
        }

    pool = {}
    for category, deal in combos:
        key = f'{category}|{deal}'
        candidates = by_cat_deal.get(key, [])
        if not candidates:
            continue

        # Все районы (без фильтра по району)
        all_analogs = [a for r in candidates if (a := _to_analog(r))]
        if all_analogs:
            pool[_pool_key(category, deal, '')] = all_analogs[:50]

        # По каждому конкретному району
        for district in districts:
            dist_lower = district.lower()
            dist_analogs = [
                a for r in candidates
                if dist_lower in (r.get('district') or '').lower()
                and (a := _to_analog(r))
            ]
            if dist_analogs:
                pool[_pool_key(category, deal, district)] = dist_analogs[:50]

    print(f'[price_refresh] batch_db: {len(pool)} pool keys built')
    return pool


def _batch_targeted_site(cur, conn, combos, start_idx, site_scraper, site_name, time_budget_sec=22):
    """
    Батч 1-3 (arrpro/ayax/etagi): целевой обход ВСЕХ активных комбинаций категория+сделка
    (а не одной фиксированной "office/rent" как раньше). Для каждой комбинации вызывает
    ТОЧНУЮ целевую функцию сайта (те же, что использует инвестмодель и Виртуальный брокер) —
    она сама знает правильный URL по категории+сделке и не скрапит категории без
    подтверждённого рабочего адреса.

    Найденное сразу сохраняется в market_listings (общая копилка для всех инструментов).
    Ограничение по времени (time_budget_sec) — чтобы не превысить таймаут функции 30 сек.
    Начинает с start_idx — если за один вызов не успели обойти все комбинации, продолжаем
    с этого индекса в следующем вызове того же батча (не переходя к следующему источнику).

    Возвращает (pool_analogs, next_idx) — next_idx >= len(combos) означает "источник пройден полностью".
    """
    import time as _time
    start = _time.time()
    pool_analogs: list[dict] = []
    idx = start_idx

    while idx < len(combos):
        if _time.time() - start > time_budget_sec:
            break
        category, deal = combos[idx]
        idx += 1
        try:
            items = site_scraper(category, deal)
        except Exception as e:
            print(f'[price_refresh] {site_name} {category}/{deal} error: {e}')
            items = []
        if not items:
            continue

        # Сохраняем в общую копилку market_listings — доступно для ВСЕХ инструментов сразу
        try:
            from analogs_fetcher import _save_to_market_listings
            _save_to_market_listings(cur, conn, items)
        except Exception as e:
            print(f'[price_refresh] {site_name} save error: {e}')

        for it in items:
            p = float(it.get('price') or 0)
            a = float(it.get('area') or 0)
            if p <= 0 or a <= 0:
                continue
            ppm2 = float(it.get('price_per_m2') or 0) or round(p / a)
            pool_analogs.append({
                'category': category, 'deal': deal,
                'source': it.get('source') or site_name,
                'price': p, 'area': a, 'price_per_m2': ppm2,
                'district': str(it.get('district') or ''),
                'url': str(it.get('url') or ''),
            })
        print(f'[price_refresh] {site_name} {category}/{deal}: +{len(items)}')

    print(f'[price_refresh] {site_name}: обработано {idx}/{len(combos)} комбинаций, {len(pool_analogs)} аналогов за вызов')
    return pool_analogs, idx


def _merge_into_pool(pool, site_analogs):
    """Добавляем найденные с сайта аналоги в пул по точному ключу category|deal|'' (город)."""
    if not site_analogs:
        return pool
    for a in site_analogs:
        cat = (a.get('category') or '').lower().strip()
        deal = (a.get('deal') or '').lower().strip()
        key = _pool_key(cat, deal, '')
        pool.setdefault(key, [])
        pool[key].append(a)
    return pool


# Санитарные диапазоны ₽/м² для финализации (те же что в aggregate_market_listings)
_PPM2_RANGES = {
    ('office',       'sale'): (30_000,  500_000),
    ('office',       'rent'): (300,      10_000),
    ('retail',       'sale'): (30_000,  600_000),
    ('retail',       'rent'): (300,      15_000),
    ('warehouse',    'sale'): (10_000,  300_000),
    ('warehouse',    'rent'): (100,       5_000),
    ('building',     'sale'): (20_000,  500_000),
    ('building',     'rent'): (200,      10_000),
    ('free_purpose', 'sale'): (20_000,  500_000),
    ('free_purpose', 'rent'): (200,      10_000),
    ('production',   'sale'): (5_000,   200_000),
    ('production',   'rent'): (50,        3_000),
    ('car_service',  'sale'): (20_000,  300_000),
    ('car_service',  'rent'): (200,       8_000),
    ('restaurant',   'sale'): (30_000,  500_000),
    ('restaurant',   'rent'): (300,      15_000),
    ('catering',     'sale'): (30_000,  500_000),
    ('catering',     'rent'): (300,      15_000),
    ('hotel',        'sale'): (20_000,  500_000),
    ('hotel',        'rent'): (200,      10_000),
    ('gab',          'sale'): (30_000,  600_000),
    ('land',         'sale'): (1_000,   150_000),
    ('business',     'sale'): (5_000,   500_000),
    ('industrial',   'sale'): (5_000,   200_000),
    ('standalone',   'sale'): (20_000,  500_000),
}


def _batch_finalize(cur, conn, pool, today):
    """Батч 5: сохраняем снапшоты из накопленного пула с санитарной фильтрацией."""
    saved = 0
    for key, analogs in pool.items():
        parts = key.split('|', 2)
        if len(parts) != 3:
            continue
        category, deal, district = parts

        # Санитарный фильтр ₽/м² — убираем нереалистичные значения
        ppm2_range = _PPM2_RANGES.get((category, deal))
        if ppm2_range:
            analogs = [
                a for a in analogs
                if ppm2_range[0] <= (a.get('price_per_m2') or 0) <= ppm2_range[1]
            ]

        snap = _calc_snapshot(analogs)
        if snap and snap['price_per_m2_median'] > 0:
            _save_snapshot(cur, today, category, deal, district, snap)
            saved += 1
    print(f'[price_refresh] finalize: saved={saved}')
    return saved


# ── Главный entry point ───────────────────────────────────────────────────────

def handle_refresh(cur, conn, force=False):
    """Выполняет ОДИН батч за вызов. Вызывается из ping_cron каждый час.

    Возвращает:
      {'batch': N, 'source': 'ayax', 'done': False}    — продолжить
      {'source': 'finalize', 'done': True, 'saved': N}  — цикл завершён
      {'skipped': True, 'reason': '...'}                — не время
    """
    cfg = _load_status(cur)
    enabled = cfg.get('price_refresh_enabled')
    if not enabled and not force:
        return {'skipped': True, 'reason': 'price_refresh_enabled=false'}

    status = cfg.get('price_refresh_status') or {}
    if isinstance(status, str):
        try:
            status = json.loads(status)
        except Exception:
            status = {}

    in_progress = status.get('in_progress', False)
    next_batch  = int(status.get('next_batch', 0))
    today       = status.get('started_at') or str(datetime.date.today())

    if not in_progress:
        now = datetime.datetime.now(datetime.timezone.utc)
        today_date = now.date()

        if force:
            # Принудительный запуск — сбрасываем любые ограничения и стартуем
            print(f'[price_refresh] forced start, today={today_date}')
        else:
            # Запускаем раз в price_refresh_interval_days дней (по умолчанию 1 — ежедневно)
            interval_days = int(cfg.get('price_refresh_interval_days') or 1)
            last_at = cfg.get('price_refresh_last_at')
            if last_at:
                if isinstance(last_at, str):
                    last_at = datetime.datetime.fromisoformat(last_at)
                last_date = last_at.date() if hasattr(last_at, 'date') else last_at
                days_since = (today_date - last_date).days
                if days_since < interval_days:
                    return {'skipped': True, 'reason': f'interval not reached ({days_since}/{interval_days} days since {last_date})'}

        next_batch = 0
        today = str(today_date)
        print(f'[price_refresh] starting cycle, today={today}')

    combos    = _get_active_combos(cur)
    districts = _get_active_districts(cur)
    source_name = BATCH_SOURCES[next_batch]
    site_combo_idx = int(status.get('site_combo_idx', 0))
    print(f'[price_refresh] batch={next_batch} ({source_name}), combos={len(combos)}, districts={len(districts)}, site_combo_idx={site_combo_idx}')

    pool_raw = status.get('pool', {})
    pool = {k: v for k, v in pool_raw.items() if isinstance(v, list)}

    # ── Выполняем текущий батч ─────────────────────────────────────────────
    if source_name == 'db':
        pool = _batch_db(cur, combos, districts)

    elif source_name in ('arrpro', 'ayax', 'etagi'):
        from analogs_fetcher import scrape_arrpro_targeted, _scrape_ayax_targeted, _scrape_etagi_targeted
        site_scrapers = {
            'arrpro': lambda cat, deal: scrape_arrpro_targeted(cat, deal),
            'ayax': lambda cat, deal: _scrape_ayax_targeted(cat, deal, 0),
            'etagi': lambda cat, deal: _scrape_etagi_targeted(cat, deal, 0),
        }
        site_analogs, next_idx = _batch_targeted_site(
            cur, conn, combos, site_combo_idx, site_scrapers[source_name], source_name
        )
        pool = _merge_into_pool(pool, site_analogs)

        if next_idx < len(combos):
            # Не успели обойти все комбинации — продолжаем этот же батч в следующем вызове
            _save_status(cur, conn, {
                'in_progress': True,
                'started_at': today,
                'next_batch': next_batch,
                'site_combo_idx': next_idx,
                'pool': pool,
            })
            return {
                'done': False, 'batch': next_batch, 'source': source_name,
                'pool_keys': len(pool), 'next': source_name,
                'progress': f'{next_idx}/{len(combos)}',
            }
        # Источник пройден полностью — сбрасываем индекс, идём к следующему батчу
        site_combo_idx = 0

    elif source_name == 'moreon':
        from mela_price import _scrape_moreon
        moreon_analogs = []
        for deal in ('sale', 'rent'):
            try:
                items = _scrape_moreon({'deal': deal, 'area': 0})
            except Exception as e:
                print(f'[price_refresh] moreon {deal} error: {e}')
                items = []
            for it in items:
                p = float(it.get('price') or 0)
                a = float(it.get('area') or 0)
                if p <= 0 or a <= 0:
                    continue
                moreon_analogs.append({
                    'category': '', 'deal': deal, 'source': 'moreon-invest.ru',
                    'price': p, 'area': a,
                    'price_per_m2': float(it.get('price_per_m2') or 0) or round(p / a),
                    'district': '', 'url': str(it.get('url') or ''),
                })
        # moreon без категорий — добавляем к каждой активной комбинации той же сделки
        for category, deal in combos:
            matched = [dict(a, category=category) for a in moreon_analogs if a['deal'] == deal]
            if matched:
                key = _pool_key(category, deal, '')
                pool.setdefault(key, [])
                pool[key].extend(matched)
        print(f'[price_refresh] moreon: {len(moreon_analogs)} analogs распределены по {len(combos)} комбинациям')

    elif source_name == 'finalize':
        saved = _batch_finalize(cur, conn, pool, today)
        _update_last_at(cur, conn)
        return {
            'done': True, 'batch': next_batch, 'source': source_name,
            'saved': saved, 'date': today,
            'combos': len(combos), 'districts': len(districts),
        }

    # Сохраняем прогресс и переходим к следующему батчу
    next_batch += 1
    _save_status(cur, conn, {
        'in_progress': True,
        'started_at': today,
        'next_batch': next_batch,
        'site_combo_idx': 0,
        'pool': pool,
    })

    next_src = BATCH_SOURCES[next_batch] if next_batch < len(BATCH_SOURCES) else 'done'
    return {
        'done': False, 'batch': next_batch - 1, 'source': source_name,
        'pool_keys': len(pool), 'next': next_src,
    }


# ── Агрегация market_listings → price_market_snapshots ───────────────────────

def aggregate_market_listings(cur, conn, today=None):
    """Агрегирует сырые объявления из market_listings в price_market_snapshots.

    Вызывается:
      - после завершения XLSX-импорта (market-import)
      - вручную через action=aggregate_market_listings

    Логика: группируем по category + deal_type + district, считаем медианы ₽/м².
    Источник в снапшоте: 'market_listings (импорт)'.
    """
    if today is None:
        today = str(datetime.date.today())

    # Строим маппинг для нормализации районов из market_listings:
    # 1) микрорайон → название административного округа (через parent_id)
    # 2) частичное совпадение с округом (Западный → Западный округ)
    cur.execute(f"""
        SELECT d.name as micro, p.name as okrug
        FROM {SCHEMA}.districts d
        JOIN {SCHEMA}.districts p ON p.id = d.parent_id
        WHERE d.is_active = TRUE AND p.is_okrug = TRUE
    """)
    micro_to_okrug = {r['micro'].lower(): r['okrug'] for r in cur.fetchall()}

    cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE AND is_okrug = TRUE")
    okrug_names = [r['name'] for r in cur.fetchall()]
    # «Западный» → «Западный округ»
    okrug_short_map = {o.replace(' округ', '').lower(): o for o in okrug_names}
    okrug_short_map.update({o.lower(): o for o in okrug_names})

    def _norm_district(raw: str) -> str:
        if not raw:
            return ''
        lo = raw.lower().strip()
        # Точное совпадение с округом
        if lo in okrug_short_map:
            return okrug_short_map[lo]
        # Микрорайон → округ
        if lo in micro_to_okrug:
            return micro_to_okrug[lo]
        # Частичное совпадение с округом
        for short, full in okrug_short_map.items():
            if short in lo or lo in short:
                return full
        return raw  # оставляем как есть

    # Загружаем все актуальные записи из market_listings (не старше 1 года)
    cur.execute(f"""
        SELECT category, deal_type, district, price, area, price_per_m2
        FROM {SCHEMA}.market_listings
        WHERE price > 0 AND area > 0
          AND category IS NOT NULL
          AND category NOT IN ('other', 'residential_skip')
          AND deal_type IS NOT NULL
          AND scraped_at >= NOW() - INTERVAL '365 days'
        ORDER BY scraped_at DESC
        LIMIT 100000
    """)
    rows = cur.fetchall()
    print(f'[aggregate_ml] loaded {len(rows)} rows from market_listings')

    if not rows:
        return {'saved': 0, 'skipped': 'no data in market_listings'}

    # Нормализуем deal_type → deal ('продажа' → 'sale' etc)
    DEAL_NORM = {
        'sale': 'sale', 'продажа': 'sale', 'продам': 'sale',
        'rent': 'rent', 'аренда': 'rent', 'сдам': 'rent',
    }

    # Группируем по (category, deal, district)
    groups = {}
    for r in rows:
        cat  = (r.get('category') or '').strip()
        deal_raw = (r.get('deal_type') or 'sale').lower().strip()
        deal = DEAL_NORM.get(deal_raw, 'sale')
        dist_raw = (r.get('district') or '').strip()
        # Нормализуем: микрорайон или сырое название → административный округ
        dist = _norm_district(dist_raw)

        p  = float(r.get('price') or 0)
        a  = float(r.get('area') or 0)

        # Земля: ЦИАН хранит площадь в сотках (обычно 1–500), arrpro — в м² (обычно >500).
        # Если area < 500 и категория land — считаем сотки, конвертируем в м² (×100).
        if cat == 'land' and 0 < a < 500:
            a = a * 100  # сотки → м²

        ppm2 = float(r.get('price_per_m2') or 0)
        # Пересчитываем ppm2 по нормализованной площади
        ppm2 = round(p / a) if a > 0 and p > 0 else 0

        if p <= 0 or a <= 0 or ppm2 <= 0:
            continue

        # Санитарный фильтр ₽/м² по категории + тип сделки
        # Убираем нереалистичные значения (гаражи в car_service, нежильё с ценами квартир и т.д.)
        PPM2_RANGES = {
            # (min, max) ₽/м²
            ('office',       'sale'): (30_000,  500_000),
            ('office',       'rent'): (300,      10_000),
            ('retail',       'sale'): (30_000,  600_000),
            ('retail',       'rent'): (300,      15_000),
            ('warehouse',    'sale'): (10_000,  300_000),
            ('warehouse',    'rent'): (100,       5_000),
            ('building',     'sale'): (20_000,  500_000),
            ('building',     'rent'): (200,      10_000),
            ('free_purpose', 'sale'): (20_000,  500_000),
            ('free_purpose', 'rent'): (200,      10_000),
            ('production',   'sale'): (5_000,   200_000),
            ('production',   'rent'): (50,        3_000),
            ('car_service',  'sale'): (20_000,  300_000),
            ('car_service',  'rent'): (200,       8_000),
            ('restaurant',   'sale'): (30_000,  500_000),
            ('restaurant',   'rent'): (300,      15_000),
            ('catering',     'sale'): (30_000,  500_000),
            ('catering',     'rent'): (300,      15_000),
            ('hotel',        'sale'): (20_000,  500_000),
            ('hotel',        'rent'): (200,      10_000),
            ('gab',          'sale'): (30_000,  600_000),
            ('land',         'sale'): (1_000,   150_000),
            ('business',     'sale'): (5_000,   500_000),
            ('industrial',   'sale'): (5_000,   200_000),
            ('industrial',   'rent'): (50,        3_000),
            ('standalone',   'sale'): (20_000,  500_000),
            ('standalone',   'rent'): (200,      10_000),
        }
        ppm2_range = PPM2_RANGES.get((cat, deal))
        if ppm2_range and not (ppm2_range[0] <= ppm2 <= ppm2_range[1]):
            continue
        # Для земли дополнительный санитарный фильтр (уже покрыт выше, но оставим для совместимости)
        if cat == 'land' and not (1_000 <= ppm2 <= 150_000):
            continue

        # Ключ без района (все районы) и с районом
        for key_dist in ['', dist] if dist else ['']:
            key = f'{cat}|{deal}|{key_dist}'
            if key not in groups:
                groups[key] = []
            groups[key].append({'price': p, 'area': a, 'price_per_m2': ppm2,
                                 'source': 'market_listings'})

    print(f'[aggregate_ml] {len(groups)} groups to aggregate')

    # Удаляем старые снапшоты из market_listings за сегодня — перепишем свежими
    cur.execute(f"""
        DELETE FROM {SCHEMA}.price_market_snapshots
        WHERE snapshot_date = '{today}'
          AND sources::text LIKE '%market_listings%'
    """)
    deleted = cur.rowcount
    print(f'[aggregate_ml] deleted {deleted} stale snapshots for {today}')

    saved = 0
    for key, analogs in groups.items():
        if len(analogs) < 3:  # меньше 3 объявлений — ненадёжно
            continue
        parts = key.split('|', 2)
        if len(parts) != 3:
            continue
        category, deal, district = parts

        snap = _calc_snapshot(analogs)
        if not snap or snap['price_per_m2_median'] <= 0:
            continue

        # Помечаем источник как market_listings
        snap['sources'] = ['market_listings (импорт)']
        _save_snapshot(cur, today, category, deal, district, snap)
        saved += 1

    conn.commit()
    print(f'[aggregate_ml] saved={saved} snapshots')
    return {'saved': saved, 'groups_total': len(groups), 'deleted_stale': deleted, 'date': today}


# ── handle_stats ──────────────────────────────────────────────────────────────

def handle_stats(cur, params):
    """Возвращает исторические снапшоты для графиков."""
    category = params.get('category') or ''
    deal     = params.get('deal') or ''
    district = params.get('district') or ''
    days     = int(params.get('days') or 180)

    where = [f"snapshot_date >= NOW() - INTERVAL '{days} days'"]
    if category:
        where.append(f"category = '{category.replace(chr(39), chr(39)*2)}'")
    if deal:
        where.append(f"deal = '{deal.replace(chr(39), chr(39)*2)}'")
    if district is not None:
        where.append(f"district = '{district.replace(chr(39), chr(39)*2)}'")

    cur.execute(f"""
        SELECT snapshot_date, category, deal, district,
               price_median, price_min, price_max, price_per_m2_median,
               analogs_count, sources
        FROM {SCHEMA}.price_market_snapshots
        WHERE {' AND '.join(where)}
        ORDER BY snapshot_date ASC, category, deal, district
        LIMIT 2000
    """)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows:
        if r.get('snapshot_date'):
            r['snapshot_date'] = str(r['snapshot_date'])
        for k in ('price_median', 'price_min', 'price_max', 'price_per_m2_median'):
            if r.get(k) is not None:
                r[k] = float(r[k])

    cur.execute(f"""
        SELECT DISTINCT ON (category, deal, district)
            category, deal, district,
            price_per_m2_median, price_median, analogs_count, snapshot_date
        FROM {SCHEMA}.price_market_snapshots
        ORDER BY category, deal, district, snapshot_date DESC
    """)
    latest = [dict(r) for r in cur.fetchall()]
    for r in latest:
        if r.get('snapshot_date'):
            r['snapshot_date'] = str(r['snapshot_date'])
        for k in ('price_per_m2_median', 'price_median'):
            if r.get(k) is not None:
                r[k] = float(r[k])

    cur.execute(
        f"SELECT price_refresh_enabled, price_refresh_last_at, "
        f"price_refresh_interval_days, price_refresh_status "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    srow = cur.fetchone()
    schedule = {}
    if srow:
        st = srow.get('price_refresh_status') or {}
        if isinstance(st, str):
            try:
                st = json.loads(st)
            except Exception:
                st = {}
        nb = st.get('next_batch')
        # Вычисляем дату следующего запуска — 1-е число следующего месяца
        _today = datetime.date.today()
        if _today.month == 12:
            _next_run = datetime.date(_today.year + 1, 1, 1)
        else:
            _next_run = datetime.date(_today.year, _today.month + 1, 1)

        schedule = {
            'enabled':     srow.get('price_refresh_enabled'),
            'last_at':     str(srow['price_refresh_last_at']) if srow.get('price_refresh_last_at') else None,
            'schedule':    '1-е число каждого месяца',
            'next_run':    str(_next_run),
            'in_progress': bool(st.get('in_progress')),
            'next_source': BATCH_SOURCES[int(nb)] if nb is not None and int(nb) < len(BATCH_SOURCES) else None,
        }

    cur.execute(f"SELECT DISTINCT category, deal FROM {SCHEMA}.price_market_snapshots ORDER BY category, deal")
    available_combos = [{'category': r['category'], 'deal': r['deal']} for r in cur.fetchall()]

    cur.execute(f"SELECT name FROM {SCHEMA}.districts WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC")
    available_districts = [r['name'] for r in cur.fetchall()]

    cur.execute(f"SELECT market_listings_agg_last_at FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1")
    agg_row = cur.fetchone()
    agg_last_at = str(agg_row['market_listings_agg_last_at']) if agg_row and agg_row.get('market_listings_agg_last_at') else None

    return {
        'snapshots': rows, 'latest': latest, 'schedule': schedule,
        'available_combos': available_combos,
        'available_districts': available_districts,
        'agg_last_at': agg_last_at,
    }