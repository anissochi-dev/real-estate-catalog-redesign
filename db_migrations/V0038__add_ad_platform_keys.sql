CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.ad_platform_keys (
  id serial PRIMARY KEY,
  platform varchar(50) NOT NULL UNIQUE,
  api_key text,
  api_secret text,
  extra jsonb,
  is_active boolean DEFAULT false,
  updated_at timestamptz DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.ad_platform_keys (platform) VALUES
  ('avito'), ('cian'), ('yandex_realty'), ('domclick'), ('youla')
ON CONFLICT (platform) DO NOTHING;