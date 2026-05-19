ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS yookassa_shop_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS yookassa_secret_key VARCHAR(500);
