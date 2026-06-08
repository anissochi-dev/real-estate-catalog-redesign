CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.geo_api_quota (
  id            SERIAL PRIMARY KEY,
  provider      TEXT NOT NULL UNIQUE,
  requests_used INTEGER NOT NULL DEFAULT 0,
  requests_limit INTEGER NOT NULL DEFAULT 9999,
  day_start     DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.geo_api_quota (provider, requests_limit) VALUES
  ('yandex',    9999),
  ('dadata',    9999),
  ('maps_co',   9999),
  ('nominatim', 9999)
ON CONFLICT (provider) DO NOTHING;
