ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS vk_ads_client_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vk_ads_client_secret TEXT DEFAULT NULL;