ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS yandex_webmaster_token text NULL,
  ADD COLUMN IF NOT EXISTS yandex_webmaster_user_id varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS google_search_console_key text NULL;
