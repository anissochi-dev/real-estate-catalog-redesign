CREATE TABLE t_p71821556_real_estate_catalog_.avito_item_status (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL,
    avito_id BIGINT,
    url TEXT,
    status VARCHAR(50),
    status_detail VARCHAR(100),
    status_message TEXT,
    uniq_views INTEGER,
    uniq_contacts INTEGER,
    uniq_favorites INTEGER,
    checked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(listing_id)
);

CREATE INDEX idx_avito_item_status_listing ON t_p71821556_real_estate_catalog_.avito_item_status(listing_id);

CREATE TABLE t_p71821556_real_estate_catalog_.avito_report_log (
    id SERIAL PRIMARY KEY,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    report_status VARCHAR(50),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    total_ads INTEGER,
    success_count INTEGER,
    problem_count INTEGER,
    error_count INTEGER,
    messages JSONB,
    error TEXT
);
