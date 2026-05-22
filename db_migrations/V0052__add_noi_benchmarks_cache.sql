CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.noi_benchmarks_cache (
  listing_id INTEGER PRIMARY KEY,
  benchmarks JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_noi_benchmarks_expires
  ON t_p71821556_real_estate_catalog_.noi_benchmarks_cache(expires_at);