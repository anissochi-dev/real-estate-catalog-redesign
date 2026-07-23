ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds
  ADD COLUMN IF NOT EXISTS cdn_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMP;
