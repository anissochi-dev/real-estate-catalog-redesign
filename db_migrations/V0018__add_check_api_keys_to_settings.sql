ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS zachestny_api_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS newdb_api_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS bezopasno_api_key VARCHAR(500);
