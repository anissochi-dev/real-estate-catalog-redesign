ALTER TABLE t_p71821556_real_estate_catalog_.phone_subscriptions
  ADD COLUMN IF NOT EXISTS price_min bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_max bigint DEFAULT NULL;