ALTER TABLE t_p71821556_real_estate_catalog_.noi_benchmarks_cache
  ADD COLUMN IF NOT EXISTS analogs_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analogs_source_level VARCHAR(20) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3) DEFAULT 0.000;