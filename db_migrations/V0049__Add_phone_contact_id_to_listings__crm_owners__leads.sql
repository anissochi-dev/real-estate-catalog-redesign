-- Привязка собственников к единой телефонной базе
ALTER TABLE t_p71821556_real_estate_catalog_.listings 
  ADD COLUMN IF NOT EXISTS owner_phone_contact_id INTEGER 
  REFERENCES t_p71821556_real_estate_catalog_.phone_contacts(id);

ALTER TABLE t_p71821556_real_estate_catalog_.listings 
  ADD COLUMN IF NOT EXISTS owner_phone2_contact_id INTEGER 
  REFERENCES t_p71821556_real_estate_catalog_.phone_contacts(id);

ALTER TABLE t_p71821556_real_estate_catalog_.crm_owners 
  ADD COLUMN IF NOT EXISTS phone_contact_id INTEGER 
  REFERENCES t_p71821556_real_estate_catalog_.phone_contacts(id);

ALTER TABLE t_p71821556_real_estate_catalog_.leads 
  ADD COLUMN IF NOT EXISTS phone_contact_id INTEGER 
  REFERENCES t_p71821556_real_estate_catalog_.phone_contacts(id);

CREATE INDEX IF NOT EXISTS idx_listings_owner_phone_contact 
  ON t_p71821556_real_estate_catalog_.listings(owner_phone_contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_owners_phone_contact 
  ON t_p71821556_real_estate_catalog_.crm_owners(phone_contact_id);

CREATE INDEX IF NOT EXISTS idx_leads_phone_contact 
  ON t_p71821556_real_estate_catalog_.leads(phone_contact_id);
