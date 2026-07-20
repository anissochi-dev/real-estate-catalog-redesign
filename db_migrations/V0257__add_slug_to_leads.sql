ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS slug VARCHAR(150) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_leads_slug ON t_p71821556_real_estate_catalog_.leads(slug);