ALTER TABLE t_p71821556_real_estate_catalog_.settings
    ADD COLUMN IF NOT EXISTS price_refresh_status JSONB DEFAULT '{}'::jsonb;
