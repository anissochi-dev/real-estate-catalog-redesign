CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.qr_banner_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    width_cm NUMERIC(8,2) NOT NULL,
    height_cm NUMERIC(8,2) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by INTEGER,
    created_by_name VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    archived BOOLEAN NOT NULL DEFAULT FALSE
);