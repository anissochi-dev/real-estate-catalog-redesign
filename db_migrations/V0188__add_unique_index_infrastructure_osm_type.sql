ALTER TABLE t_p71821556_real_estate_catalog_.infrastructure
  ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_infrastructure_osm_type
  ON t_p71821556_real_estate_catalog_.infrastructure (osm_id, infra_type);