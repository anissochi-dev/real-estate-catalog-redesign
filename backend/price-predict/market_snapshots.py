"""Рыночные снапшоты цен: сбор, хранение и выдача для графиков.

Батчевая стратегия (укладываемся в таймаут 30 сек):
  Каждый вызов handle_refresh() обрабатывает ОДИН источник данных:
    batch 0 → база системы (быстро, < 2 сек)
    batch 1 → arrpro.ru
    batch 2 → ayax.ru
    batch 3 → etagi.com
    batch 4 → moreon-invest.ru
    batch 5 → финализация (merge + commit снапшотов)

  Прогресс хранится в settings.price_refresh_status (JSONB):
    {
      "in_progress": true,
      "started_at": "2026-06-04",
      "next_batch": 1,
      "pool": {"office|rent|": [...], "office|rent|Центральный": [...]}
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
    """Батч 0: собираем аналоги из внутренней БД."""
    from mela_price import _db_analogs
    pool = {}
    for category, deal in combos:
        sample_area = CATEGORY_SAMPLE_AREA.get(category, 100)
        analogs_all = _db_analogs(cur, {
            'category': category, 'deal': deal, 'area': sample_area,
            'price': 0, 'district': '', 'condition': '',
        })
        if analogs_all:
            pool[_pool_key(category, deal, '')] = analogs_all
        for district in districts:
            analogs_d = _db_analogs(cur, {
                'category': category, 'deal': deal, 'area': sample_area,
                'price': 0, 'district': district, 'condition': '',
            })
            if analogs_d:
                pool[_pool_key(category, deal, district)] = analogs_d
    print(f'[price_refresh] batch_db: {len(pool)} keys')
    return pool


def _batch_site(scraper_fn, site_name):
    """Батч 1-4: парсим один сайт, возвращаем сырые аналоги."""
    try:
        generic = {'category': 'office', 'deal': 'rent', 'area': 100,
                   'price': 0, 'district': '', 'condition': ''}
        analogs = scraper_fn(generic)
        print(f'[price_refresh] batch_{site_name}: {len(analogs)} analogs')
        return analogs
    except Exception as e:
        print(f'[price_refresh] batch_{site_name} error: {e}')
        return []


def _merge_site_analogs(pool, site_analogs):
    """Добавляем аналоги сайта ко всем ключам пула (обогащаем каждую комбинацию)."""
    if not site_analogs:
        return pool
    for key in list(pool.keys()):
        pool[key] = pool[key] + site_analogs
    return pool


def _batch_finalize(cur, conn, pool, today):
    """Батч 5: сохраняем снапшоты из накопленного пула."""
    saved = 0
    for key, analogs in pool.items():
        parts = key.split('|', 2)
        if len(parts) != 3:
            continue
        category, deal, district = parts
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
    from mela_price import _scrape_arrpro, _scrape_ayax, _scrape_etagi, _scrape_moreon

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
            # Запускаем только 1-го числа каждого месяца
            if today_date.day != 1:
                return {'skipped': True, 'reason': f'not 1st day of month (today={today_date})'}

            # Защита от повторного запуска в том же месяце
            last_at = cfg.get('price_refresh_last_at')
            if last_at:
                if isinstance(last_at, str):
                    last_at = datetime.datetime.fromisoformat(last_at)
                last_date = last_at.date() if hasattr(last_at, 'date') else last_at
                if last_date.year == today_date.year and last_date.month == today_date.month:
                    return {'skipped': True, 'reason': f'already ran this month ({last_date})'}

        next_batch = 0
        today = str(today_date)
        print(f'[price_refresh] starting cycle, today={today}')

    combos    = _get_active_combos(cur)
    districts = _get_active_districts(cur)
    source_name = BATCH_SOURCES[next_batch]
    print(f'[price_refresh] batch={next_batch} ({source_name}), combos={len(combos)}, districts={len(districts)}')

    pool_raw = status.get('pool', {})
    pool = {k: v for k, v in pool_raw.items() if isinstance(v, list)}

    # ── Выполняем текущий батч ─────────────────────────────────────────────
    if source_name == 'db':
        pool = _batch_db(cur, combos, districts)

    elif source_name == 'arrpro':
        pool = _merge_site_analogs(pool, _batch_site(_scrape_arrpro, 'arrpro'))

    elif source_name == 'ayax':
        pool = _merge_site_analogs(pool, _batch_site(_scrape_ayax, 'ayax'))

    elif source_name == 'etagi':
        pool = _merge_site_analogs(pool, _batch_site(_scrape_etagi, 'etagi'))

    elif source_name == 'moreon':
        pool = _merge_site_analogs(pool, _batch_site(_scrape_moreon, 'moreon'))

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
        'pool': pool,
    })

    next_src = BATCH_SOURCES[next_batch] if next_batch < len(BATCH_SOURCES) else 'done'
    return {
        'done': False, 'batch': next_batch - 1, 'source': source_name,
        'pool_keys': len(pool), 'next': next_src,
    }


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

    cur.execute(f"SELECT DISTINCT district FROM {SCHEMA}.price_market_snapshots WHERE district != '' ORDER BY district")
    available_districts = [r['district'] for r in cur.fetchall()]

    return {
        'snapshots': rows, 'latest': latest, 'schedule': schedule,
        'available_combos': available_combos,
        'available_districts': available_districts,
    }