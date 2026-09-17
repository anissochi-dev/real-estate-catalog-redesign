ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS access_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS legal_address_provided BOOLEAN;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.access_type IS 'Доступ в помещение: free (свободный) / controlled (пропускная система)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.legal_address_provided IS 'Юридический адрес предоставляется вместе с помещением (для аренды)';