CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.import_jobs (
    id SERIAL PRIMARY KEY,
    file_url TEXT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'xlsx',
    replace_existing BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    rows_total INTEGER,
    rows_done INTEGER NOT NULL DEFAULT 0,
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    rows_updated INTEGER NOT NULL DEFAULT 0,
    rows_skipped INTEGER NOT NULL DEFAULT 0,
    error_msg TEXT,
    category_breakdown JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
