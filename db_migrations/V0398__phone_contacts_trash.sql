ALTER TABLE t_p71821556_real_estate_catalog_.phone_contacts ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ NULL;
ALTER TABLE t_p71821556_real_estate_catalog_.phone_contacts ADD COLUMN IF NOT EXISTS trashed_by INTEGER NULL;
CREATE INDEX IF NOT EXISTS idx_phone_contacts_trashed_at ON t_p71821556_real_estate_catalog_.phone_contacts (trashed_at);