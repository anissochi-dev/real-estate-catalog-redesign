ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS home_listings_limit integer NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS catalog_page_size integer NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS news_list_limit integer NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS category_page_size integer NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS leads_page_size integer NULL DEFAULT 24;