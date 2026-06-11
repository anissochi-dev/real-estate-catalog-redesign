
-- market_snapshots: история медиан рынка по категории/сделке/району
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.market_snapshots (
    id            SERIAL PRIMARY KEY,
    category      VARCHAR(50)   NOT NULL,
    deal          VARCHAR(20)   NOT NULL,
    district      VARCHAR(100)  NOT NULL DEFAULT '',
    median_per_m2 INTEGER       NOT NULL,
    min_per_m2    INTEGER,
    max_per_m2    INTEGER,
    q1_per_m2     INTEGER,
    q3_per_m2     INTEGER,
    analogs_count INTEGER       NOT NULL DEFAULT 0,
    sources       TEXT,
    used_gpt_fallback BOOLEAN   NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_snapshots_cat_deal
    ON t_p71821556_real_estate_catalog_.market_snapshots (category, deal, district, created_at DESC);
