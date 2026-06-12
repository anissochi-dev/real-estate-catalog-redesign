ALTER TABLE t_p71821556_real_estate_catalog_.listings
ADD COLUMN IF NOT EXISTS faq_updated_at TIMESTAMPTZ DEFAULT NULL;
