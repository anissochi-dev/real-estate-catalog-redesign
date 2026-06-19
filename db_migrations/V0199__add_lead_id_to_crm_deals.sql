ALTER TABLE t_p71821556_real_estate_catalog_.crm_deals
  ADD COLUMN IF NOT EXISTS lead_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_crm_deals_lead_id
  ON t_p71821556_real_estate_catalog_.crm_deals(lead_id);
