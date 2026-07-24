ALTER TABLE t_p71821556_real_estate_catalog_.cian_offers
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_cian_offers_archived_at
  ON t_p71821556_real_estate_catalog_.cian_offers (archived_at);