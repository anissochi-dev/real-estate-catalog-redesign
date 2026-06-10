CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.price_history_biweekly (
    id           BIGSERIAL    PRIMARY KEY,
    date_recorded DATE         NOT NULL,
    category      VARCHAR(50)  NOT NULL,
    deal_type     VARCHAR(10)  NOT NULL CHECK (deal_type IN ('sale', 'rent')),
    price_per_m2  DECIMAL(12,2),
    change_pct    DECIMAL(6,2),
    source        VARCHAR(100) DEFAULT 'xlsx_import',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (date_recorded, category, deal_type)
);

CREATE INDEX IF NOT EXISTS idx_phb_date     ON t_p71821556_real_estate_catalog_.price_history_biweekly(date_recorded DESC);
CREATE INDEX IF NOT EXISTS idx_phb_category ON t_p71821556_real_estate_catalog_.price_history_biweekly(category, deal_type);
