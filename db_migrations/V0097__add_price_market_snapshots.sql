CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.price_market_snapshots (
    id            SERIAL PRIMARY KEY,
    snapshot_date DATE        NOT NULL,
    category      VARCHAR(50) NOT NULL,
    deal          VARCHAR(20) NOT NULL,
    district      VARCHAR(100) NOT NULL DEFAULT '',
    price_median  NUMERIC(15,2),
    price_min     NUMERIC(15,2),
    price_max     NUMERIC(15,2),
    price_per_m2_median NUMERIC(12,2),
    analogs_count INTEGER     DEFAULT 0,
    sources       JSONB       DEFAULT '[]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_snapshots_unique
    ON t_p71821556_real_estate_catalog_.price_market_snapshots
    (snapshot_date, category, deal, district);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_date
    ON t_p71821556_real_estate_catalog_.price_market_snapshots (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_cat
    ON t_p71821556_real_estate_catalog_.price_market_snapshots (category, deal);

ALTER TABLE t_p71821556_real_estate_catalog_.settings
    ADD COLUMN IF NOT EXISTS price_refresh_enabled  BOOLEAN  DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS price_refresh_last_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS price_refresh_interval_days INTEGER DEFAULT 14;
