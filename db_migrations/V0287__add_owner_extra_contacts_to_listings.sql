ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS owner_extra_contacts JSONB DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.owner_extra_contacts IS
  'Доп. контакты собственника (кроме основного owner_phone/owner_phone2): JSON-массив объектов {name, phone, phone2, phone_contact_id, phone2_contact_id}, до 3 элементов. Телефоны линкуются с phone_contacts через phone_listing_links с role=owner_extra.';