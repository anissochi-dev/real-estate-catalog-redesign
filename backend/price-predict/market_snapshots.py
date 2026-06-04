"""Рыночные снапшоты цен: сбор, хранение и выдача для графиков.

Стратегия обновления (чтобы уложиться в таймаут 30 сек):
- Категории и районы берём ДИНАМИЧЕСКИ из реальных данных БД
- Массовый сбор работает ТОЛЬКО через БД (быстро, <2 сек)
- Парсинг внешних сайтов запускается один раз, результат агрегируется
  по категориям на основе ключевых слов в заголовках/описаниях
"""
import datetime
import json
import statistics

SCHEMA = 't_p71821556_real_estate_catalog_'

# Типовые площади для запроса по каждой категории
CATEGORY_SAMPLE_AREA = {
    'office': 100, 'retail': 150, 'warehouse': 500,
    'building': 800, 'free_purpose': 120, 'production': 400,
    'business': 200, 'hotel': 1000, 'land': 10,
    'restaurant': 150, 'gab': 300, 'car_service': 200,
}


def _get_active_combos(cur):
    """Возвращает список (category, deal) реально присутствующих в активных объектах."""
    cur.execute(f"""
        SELECT DISTINCT category, deal
        FROM {SCHEMA}.listings
        WHERE status IN ('active', 'archived') AND category IS NOT NULL AND deal IS NOT NULL
        ORDER BY category, deal
    """)
    return [(r['category'], r['deal']) for r in cur.fetchall()]


def _get_active_districts(cur):
    """Возвращает '' (все районы) + реальные районы из активных объектов."""
    cur.execute(f"""
        SELECT DISTINCT TRIM(district) AS district
        FROM {SCHEMA}.listings
        WHERE status IN ('active', 'archived')
          AND district IS NOT NULL AND TRIM(district) != ''
        ORDER BY district
        LIMIT 20
    """)
    districts = [r['district'] for r in cur.fetchall()]
    return [''] + districts  # '' = все районы без фильтра


def _calc_snapshot(all_analogs):
    """Считает медианы/мин/макс из списка аналогов. Возвращает dict или None."""
    prices_per_m2 = [a['price_per_m2'] for a in all_analogs if a.get('price_per_m2', 0) > 0]
    raw_prices = [a['price'] for a in all_analogs if a.get('price', 0) > 0]
    if not prices_per_m2:
        return None

    srt = sorted(prices_per_m2)
    lo = srt[int(len(srt) * 0.1)]
    hi = srt[min(int(len(srt) * 0.9), len(srt) - 1)]
    filtered = [p for p in srt if lo <= p <= hi] or srt

    raw_sorted = sorted(raw_prices)
    return {
        'price_per_m2_median': statistics.median(filtered),
        'price_median': statistics.median(raw_sorted) if raw_sorted else None,
        'price_min': raw_sorted[0] if raw_sorted else None,
        'price_max': raw_sorted[-1] if raw_sorted else None,
        'analogs_count': len(all_analogs),
        'sources': list({a.get('source', '') for a in all_analogs if a.get('source')}),
    }


def _save_snapshot(cur, today, category, deal, district, snap):
    """Сохраняет один снапшот в БД."""
    src_json = json.dumps(snap['sources'], ensure_ascii=False).replace("'", "''")
    dist_safe = district.replace("'", "''")
    pm = snap['price_median']
    pmin = snap['price_min']
    pmax = snap['price_max']
    cur.execute(f"""
        INSERT INTO {SCHEMA}.price_market_snapshots
            (snapshot_date, category, deal, district,
             price_median, price_min, price_max, price_per_m2_median,
             analogs_count, sources)
        VALUES ('{today}', '{category}', '{deal}', '{dist_safe}',
                {pm if pm else 'NULL'}, {pmin if pmin else 'NULL'}, {pmax if pmax else 'NULL'},
                {snap['price_per_m2_median']}, {snap['analogs_count']}, '{src_json}')
        ON CONFLICT (snapshot_date, category, deal, district)
        DO UPDATE SET
            price_median         = EXCLUDED.price_median,
            price_min            = EXCLUDED.price_min,
            price_max            = EXCLUDED.price_max,
            price_per_m2_median  = EXCLUDED.price_per_m2_median,
            analogs_count        = EXCLUDED.analogs_count,
            sources              = EXCLUDED.sources,
            created_at           = NOW()
    """)


def handle_refresh(cur, conn, force=False):
    """Собирает рыночные снапшоты.

    Категории и районы — динамически из БД (любые новые подхватятся автоматически).
    Внешние сайты парсим 1 раз (не для каждой комбинации) и добавляем как общий пул.
    """
    from mela_price import _db_analogs, _scrape_local_sites

    # Проверяем расписание
    cur.execute(
        f"SELECT price_refresh_last_at, price_refresh_interval_days, price_refresh_enabled "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    srow = cur.fetchone()
    if srow:
        enabled = srow.get('price_refresh_enabled')
        if not enabled and not force:
            return {'skipped': True, 'reason': 'price_refresh_enabled=false'}
        last_at = srow.get('price_refresh_last_at')
        interval_days = int(srow.get('price_refresh_interval_days') or 14)
        if last_at and not force:
            if isinstance(last_at, str):
                last_at = datetime.datetime.fromisoformat(last_at)
            age = (datetime.datetime.now(datetime.timezone.utc) - last_at.replace(tzinfo=datetime.timezone.utc)).days
            if age < interval_days:
                return {'skipped': True, 'reason': f'last run {age}d ago, interval={interval_days}d'}

    today = str(datetime.date.today())
    saved = 0
    errors = 0

    # Динамически получаем реальные комбинации и районы из БД
    combos = _get_active_combos(cur)
    districts = _get_active_districts(cur)

    print(f'[price_refresh] combos={len(combos)}, districts={len(districts)}')

    # Парсим внешние сайты ОДИН РАЗ с обобщённым запросом (без фильтра по категории)
    # Это даст общий пул аналогов для всего рынка
    site_pool = []
    try:
        generic_listing = {'category': 'office', 'deal': 'rent', 'area': 100, 'price': 0, 'district': '', 'condition': ''}
        site_pool = _scrape_local_sites(generic_listing)
        print(f'[price_refresh] site_pool={len(site_pool)} analogs from external sites')
    except Exception as e:
        print(f'[price_refresh] site scraping error: {e}')

    # Для каждой комбинации категория+сделка собираем снапшот
    for category, deal in combos:
        sample_area = CATEGORY_SAMPLE_AREA.get(category, 100)

        # Снапшот без фильтра по району (district='')
        listing_all = {
            'category': category, 'deal': deal,
            'area': sample_area, 'price': 0,
            'district': '', 'condition': '',
        }
        try:
            db_all = _db_analogs(cur, listing_all)
            all_analogs = db_all + site_pool  # внешние сайты как дополнение
            snap = _calc_snapshot(all_analogs)
            if snap:
                _save_snapshot(cur, today, category, deal, '', snap)
                saved += 1
        except Exception as e:
            print(f'[price_refresh] error {category}/{deal}/all: {e}')
            errors += 1

        # Снапшоты по каждому реальному району (только из БД — быстро)
        for district in districts:
            if not district:
                continue
            listing_d = {
                'category': category, 'deal': deal,
                'area': sample_area, 'price': 0,
                'district': district, 'condition': '',
            }
            try:
                db_d = _db_analogs(cur, listing_d)
                if not db_d:
                    continue  # нет данных по этому району — пропускаем
                snap = _calc_snapshot(db_d)
                if snap:
                    _save_snapshot(cur, today, category, deal, district, snap)
                    saved += 1
            except Exception as e:
                print(f'[price_refresh] error {category}/{deal}/{district}: {e}')
                errors += 1

    # Обновляем last_run_at
    cur.execute(
        f"UPDATE {SCHEMA}.settings SET price_refresh_last_at = NOW() "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
    )
    conn.commit()

    print(f'[price_refresh] done: saved={saved}, errors={errors}')
    return {
        'ok': True, 'date': today,
        'saved': saved, 'errors': errors,
        'combos': len(combos),
        'districts': len(districts),
    }


def handle_stats(cur, params):
    """Возвращает исторические снапшоты для графиков."""
    category = params.get('category') or ''
    deal = params.get('deal') or ''
    district = params.get('district') or ''
    days = int(params.get('days') or 180)

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
        f"SELECT price_refresh_enabled, price_refresh_last_at, price_refresh_interval_days "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    srow = cur.fetchone()
    schedule = {}
    if srow:
        schedule = {
            'enabled': srow.get('price_refresh_enabled'),
            'last_at': str(srow['price_refresh_last_at']) if srow.get('price_refresh_last_at') else None,
            'interval_days': srow.get('price_refresh_interval_days') or 14,
        }

    # Возвращаем также динамический список доступных комбинаций и районов
    cur.execute(f"""
        SELECT DISTINCT category, deal
        FROM {SCHEMA}.price_market_snapshots
        ORDER BY category, deal
    """)
    available_combos = [{'category': r['category'], 'deal': r['deal']} for r in cur.fetchall()]

    cur.execute(f"""
        SELECT DISTINCT district
        FROM {SCHEMA}.price_market_snapshots
        WHERE district != ''
        ORDER BY district
    """)
    available_districts = [r['district'] for r in cur.fetchall()]

    return {
        'snapshots': rows,
        'latest': latest,
        'schedule': schedule,
        'available_combos': available_combos,
        'available_districts': available_districts,
    }
