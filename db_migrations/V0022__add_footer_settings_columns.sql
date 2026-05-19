ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS footer_description TEXT,
  ADD COLUMN IF NOT EXISTS footer_catalog_links TEXT,
  ADD COLUMN IF NOT EXISTS footer_extra_links TEXT;
