"""Рыночные снапшоты цен: сбор, хранение и выдача для графиков."""
import datetime
import json
import statistics

SCHEMA = 't_p71821556_real_estate_catalog_'

MARKET_CATEGORIES = [
    ('office', 'rent'), ('office', 'sale'),
    ('retail', 'rent'), ('retail', 'sale'),
    ('warehouse', 'rent'), ('warehouse', 'sale'),
    ('building', 'rent'), ('building', 'sale'),
    ('free_purpose', 'rent'), ('free_purpose', 'sale'),
    ('production', 'rent'), ('production', 'sale'),
    ('business', 'sale'),
    ('hotel', 'sale'), ('hotel', 'rent'),
]

MARKET_DISTRICTS = ['', 'Центральный', 'Прикубанский', 'Карасунский', 'Западный', 'Северный']

CATEGORY_SAMPLE_AREA = {
    'office': 100, 'retail': 150, 'warehouse': 500,
    'building': 800, 'free_purpose': 120, 'production': 400,
    'business': 200, 'hotel': 1000, 'land': 10,
}


def handle_refresh(cur, conn, force=False):
    """Собирает рыночные снапшоты по всем категориям и районам. Запускается раз в 14 дней."""
    from mela_price import _db_analogs, _scrape_local_sites

    cur.execute(
        f"SELECT price_refresh_last_at, price_refresh_interval_days, price_refresh_enabled "
        f"FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1"
    )
    row = cur.fetchone()
    if row:
        enabled = row.get('price_refresh_enabled')
        if not enabled and not force:
            return {'skipped': True, 'reason': 'price_refresh_enabled=false'}
        last_at = row.get('price_refresh_last_at')
        interval_days = int(row.get('price_refresh_interval_days') or 14)
        if last_at and not force:
            if isinstance(last_at, str):
                last_at = datetime.datetime.fromisoformat(last_at)
            age = (datetime.datetime.now(datetime.timezone.utc) - last_at.replace(tzinfo=datetime.timezone.utc)).days
            if age < interval_days:
                return {'skipped': True, 'reason': f'last run {age}d ago, interval={interval_days}d'}

    today = str(datetime.date.today())
    saved = 0
    errors = 0

    for category, deal in MARKET_CATEGORIES:
        sample_area = CATEGORY_SAMPLE_AREA.get(category, 100)
        for district in MARKET_DISTRICTS:
            listing = {
                'category': category, 'deal': deal,
                'area': sample_area, 'price': 0,
                'district': district, 'condition': '',
            }
            try:
                db_analogs = _db_analogs(cur, listing)
                site_analogs = []
                try:
                    site_analogs = _scrape_local_sites(listing)
                except Exception as se:
                    print(f'[price_refresh] scrape {category}/{deal}/{district}: {se}')

                all_analogs = db_analogs + site_analogs
                if not all_analogs:
                    continue

                prices_per_m2 = [a['price_per_m2'] for a in all_analogs if a.get('price_per_m2', 0) > 0]
                raw_prices = [a['price'] for a in all_analogs if a.get('price', 0) > 0]
                if not prices_per_m2:
                    continue

                srt = sorted(prices_per_m2)
                lo = srt[int(len(srt) * 0.1)]
                hi = srt[min(int(len(srt) * 0.9), len(srt) - 1)]
                filtered = [p for p in srt if lo <= p <= hi] or srt

                median_ppm2 = statistics.median(filtered)
                raw_sorted = sorted(raw_prices)
                price_median = statistics.median(raw_sorted) if raw_sorted else None
                price_min = raw_sorted[0] if raw_sorted else None
                price_max = raw_sorted[-1] if raw_sorted else None
                sources = list({a.get('source', '') for a in all_analogs if a.get('source')})
                src_json = json.dumps(sources, ensure_ascii=False).replace("'", "''")
                dist_safe = district.replace("'", "''")

                cur.execute(f"""
                    INSERT INTO {SCHEMA}.price_market_snapshots
                        (snapshot_date, category, deal, district,
                         price_median, price_min, price_max, price_per_m2_median,
                         analogs_count, sources)
                    VALUES ('{today}', '{category}', '{deal}', '{dist_safe}',
                            {price_median or 'NULL'}, {price_min or 'NULL'}, {price_max or 'NULL'},
                            {median_ppm2}, {len(all_analogs)}, '{src_json}')
                    ON CONFLICT (snapshot_date, category, deal, district)
                    DO UPDATE SET
                        price_median = EXCLUDED.price_median,
                        price_min = EXCLUDED.price_min,
                        price_max = EXCLUDED.price_max,
                        price_per_m2_median = EXCLUDED.price_per_m2_median,
                        analogs_count = EXCLUDED.analogs_count,
                        sources = EXCLUDED.sources,
                        created_at = NOW()
                """)
                saved += 1
            except Exception as e:
                print(f'[price_refresh] error {category}/{deal}/{district}: {e}')
                errors += 1

    cur.execute(
        f"UPDATE {SCHEMA}.settings SET price_refresh_last_at = NOW() "
        f"WHERE id = (SELECT id FROM {SCHEMA}.settings ORDER BY id ASC LIMIT 1)"
    )
    conn.commit()

    return {
        'ok': True, 'date': today,
        'saved': saved, 'errors': errors,
        'categories': len(MARKET_CATEGORIES),
        'districts': len(MARKET_DISTRICTS),
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

    return {'snapshots': rows, 'latest': latest, 'schedule': schedule}
