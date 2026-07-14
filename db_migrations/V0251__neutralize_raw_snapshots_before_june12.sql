UPDATE t_p71821556_real_estate_catalog_.price_market_snapshots
SET price_median = NULL, price_min = NULL, price_max = NULL,
    price_per_m2_median = NULL, analogs_count = 0
WHERE snapshot_date < '2026-06-12';