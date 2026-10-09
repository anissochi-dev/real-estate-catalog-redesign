CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.youla_create_claims (
    listing_id INTEGER PRIMARY KEY,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by VARCHAR(100),
    youla_id VARCHAR(64),
    resolved_at TIMESTAMPTZ
);