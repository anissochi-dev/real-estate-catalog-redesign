ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS yandex_api_key VARCHAR(500),
  ADD COLUMN IF NOT EXISTS yandex_folder_id VARCHAR(100);
