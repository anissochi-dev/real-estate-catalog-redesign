ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS crm_deal_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_leads_crm_deal_id
  ON t_p71821556_real_estate_catalog_.leads(crm_deal_id);
