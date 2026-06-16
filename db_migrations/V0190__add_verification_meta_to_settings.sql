ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS yandex_webmaster_verification text DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_search_console_verification text DEFAULT '';