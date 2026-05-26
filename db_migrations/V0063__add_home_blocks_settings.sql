ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS show_news_on_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS home_news_limit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS show_leads_on_home boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS home_leads_limit integer NOT NULL DEFAULT 6;