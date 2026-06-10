ALTER TABLE t_p71821556_real_estate_catalog_.districts
    ADD COLUMN IF NOT EXISTS vacancy_rate DECIMAL(5,2),
    ADD COLUMN IF NOT EXISTS ranking      SMALLINT,
    ADD COLUMN IF NOT EXISTS notes        TEXT;

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.macro_indicators (
    id                    SERIAL PRIMARY KEY,
    date_recorded         DATE        NOT NULL UNIQUE,
    key_rate              DECIMAL(5,2),
    inflation_rate        DECIMAL(5,2),
    investment_volume_rf  DECIMAL(15,2),
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.price_history (
    id                   BIGSERIAL    PRIMARY KEY,
    year                 SMALLINT     NOT NULL,
    district_id          INTEGER      REFERENCES t_p71821556_real_estate_catalog_.districts(id),
    district_name        VARCHAR(100),
    category             VARCHAR(50)  NOT NULL,
    deal_type            VARCHAR(10)  NOT NULL CHECK (deal_type IN ('sale', 'rent', 'both')),
    avg_price_per_m2     DECIMAL(12,2),
    avg_rent_per_m2_year DECIMAL(12,2),
    avg_cap_rate         DECIMAL(5,2),
    vacancy_rate         DECIMAL(5,2),
    records_count        INTEGER      DEFAULT 0,
    source               VARCHAR(100) DEFAULT 'manual',
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (year, district_name, category, deal_type)
);

CREATE INDEX IF NOT EXISTS idx_price_history_year     ON t_p71821556_real_estate_catalog_.price_history(year);
CREATE INDEX IF NOT EXISTS idx_price_history_category ON t_p71821556_real_estate_catalog_.price_history(category, deal_type);
CREATE INDEX IF NOT EXISTS idx_price_history_district ON t_p71821556_real_estate_catalog_.price_history(district_id);
