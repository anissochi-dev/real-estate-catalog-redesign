ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS cadastral_number VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_listings_cadastral
  ON t_p71821556_real_estate_catalog_.listings(cadastral_number)
  WHERE cadastral_number IS NOT NULL;
