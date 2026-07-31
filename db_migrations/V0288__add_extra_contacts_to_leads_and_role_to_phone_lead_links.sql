ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS extra_contacts JSONB DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.leads.extra_contacts IS
  'Доп. контакты по заявке (кроме основного name/phone): JSON-массив объектов {name, phone, phone2, phone_contact_id, phone2_contact_id}, до 3 элементов. Телефоны линкуются с phone_contacts через phone_lead_links с role=lead_extra.';

ALTER TABLE t_p71821556_real_estate_catalog_.phone_lead_links
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'primary';