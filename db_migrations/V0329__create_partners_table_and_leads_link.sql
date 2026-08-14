CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.partners (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  logo_url VARCHAR(500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_active_sort
  ON t_p71821556_real_estate_catalog_.partners(is_active, sort_order);

ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS partner_id INTEGER NULL REFERENCES t_p71821556_real_estate_catalog_.partners(id);

CREATE INDEX IF NOT EXISTS idx_leads_partner_id
  ON t_p71821556_real_estate_catalog_.leads(partner_id);
