CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.phone_subscriptions (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  categories TEXT NOT NULL DEFAULT '',
  deal_type VARCHAR(10) NOT NULL DEFAULT 'all',
  city VARCHAR(100) NOT NULL DEFAULT 'Краснодар',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verify_code VARCHAR(6),
  verify_expires_at TIMESTAMPTZ,
  verify_attempts SMALLINT NOT NULL DEFAULT 0,
  max_user_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(phone)
);

CREATE INDEX IF NOT EXISTS idx_phone_sub_phone ON t_p71821556_real_estate_catalog_.phone_subscriptions(phone);
CREATE INDEX IF NOT EXISTS idx_phone_sub_active ON t_p71821556_real_estate_catalog_.phone_subscriptions(is_active, is_verified);
