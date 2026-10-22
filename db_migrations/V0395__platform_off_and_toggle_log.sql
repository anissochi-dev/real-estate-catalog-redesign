ALTER TABLE t_p71821556_real_estate_catalog_.ad_platform_keys ADD COLUMN IF NOT EXISTS platform_off BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.platform_toggle_log (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(30) NOT NULL,
  turned_off BOOLEAN NOT NULL,
  user_id INTEGER,
  user_name VARCHAR(200),
  listings_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_toggle_log_platform ON t_p71821556_real_estate_catalog_.platform_toggle_log (platform, created_at DESC);