CREATE TABLE t_p71821556_real_estate_catalog_.street_district_map (
  id SERIAL PRIMARY KEY,
  street_pattern TEXT NOT NULL,
  district TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_street_district_map_pattern ON t_p71821556_real_estate_catalog_.street_district_map (street_pattern);

COMMENT ON TABLE t_p71821556_real_estate_catalog_.street_district_map IS 'Маппинг улиц Краснодара на микрорайоны. street_pattern — подстрока названия улицы (без "улица", "проспект" и т.д.)';
