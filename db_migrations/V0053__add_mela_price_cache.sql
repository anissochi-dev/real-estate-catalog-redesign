CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.mela_price_cache (
  cache_key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mela_price_expires
  ON t_p71821556_real_estate_catalog_.mela_price_cache(expires_at);