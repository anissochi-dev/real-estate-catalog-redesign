CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.print_files (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NULL,
    layout_hash VARCHAR(64) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    cdn_url VARCHAR(700) NOT NULL,
    preview_key VARCHAR(500) NULL,
    preview_url VARCHAR(700) NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    params JSONB NULL,
    created_by INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    removed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_print_files_hash ON t_p71821556_real_estate_catalog_.print_files (layout_hash) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_print_files_expires ON t_p71821556_real_estate_catalog_.print_files (expires_at) WHERE removed_at IS NULL;