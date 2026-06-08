ALTER TABLE t_p71821556_real_estate_catalog_.street_district_map
ADD COLUMN IF NOT EXISTS okrug_id INTEGER REFERENCES t_p71821556_real_estate_catalog_.districts(id);

CREATE INDEX IF NOT EXISTS idx_street_district_map_okrug ON t_p71821556_real_estate_catalog_.street_district_map(okrug_id);
