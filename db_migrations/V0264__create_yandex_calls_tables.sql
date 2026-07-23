CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.yandex_calls (
  call_id BIGSERIAL PRIMARY KEY,
  external_id BIGINT,
  object_name TEXT,
  incoming_phone TEXT,
  internal_phone TEXT,
  wait_duration INT,
  call_duration INT,
  revenue NUMERIC(12,2),
  object_type TEXT,
  campaign_tariff TEXT,
  client_tariff TEXT,
  call_timestamp TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (call_timestamp, incoming_phone, internal_phone)
);

CREATE INDEX IF NOT EXISTS idx_yandex_calls_timestamp ON t_p71821556_real_estate_catalog_.yandex_calls (call_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_yandex_calls_external_id ON t_p71821556_real_estate_catalog_.yandex_calls (external_id);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.yandex_sync_log (
  id SERIAL PRIMARY KEY,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  calls_count INT DEFAULT 0,
  error TEXT
);
