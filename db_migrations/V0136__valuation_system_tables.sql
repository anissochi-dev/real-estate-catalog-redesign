CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.construction_cost_ref (
    id              SERIAL PRIMARY KEY,
    category        VARCHAR(50) NOT NULL,
    quality_class   VARCHAR(10) NOT NULL DEFAULT 'B',
    cost_per_m2     NUMERIC(12,2) NOT NULL,
    region          VARCHAR(100) DEFAULT 'Краснодар',
    valid_year      SMALLINT NOT NULL DEFAULT 2025,
    notes           TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (category, quality_class, region, valid_year)
);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cost_approach_cache (
    listing_id      INTEGER PRIMARY KEY,
    result          JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_approach_expires
    ON t_p71821556_real_estate_catalog_.cost_approach_cache(expires_at);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.nei_cache (
    listing_id      INTEGER PRIMARY KEY,
    result          JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nei_expires
    ON t_p71821556_real_estate_catalog_.nei_cache(expires_at);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.legal_risk_cache (
    listing_id      INTEGER PRIMARY KEY,
    result          JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_risk_expires
    ON t_p71821556_real_estate_catalog_.legal_risk_cache(expires_at);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.tech_audit_cache (
    listing_id      INTEGER PRIMARY KEY,
    result          JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tech_audit_expires
    ON t_p71821556_real_estate_catalog_.tech_audit_cache(expires_at);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.valuation_reports (
    id              SERIAL PRIMARY KEY,
    listing_id      INTEGER NOT NULL,
    report_type     VARCHAR(30) NOT NULL DEFAULT 'full',
    result          JSONB NOT NULL,
    created_by      INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_valuation_listing
    ON t_p71821556_real_estate_catalog_.valuation_reports(listing_id, created_at DESC);
