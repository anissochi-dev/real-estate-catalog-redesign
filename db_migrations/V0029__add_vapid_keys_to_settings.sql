ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS vapid_public_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS vapid_private_key TEXT NULL;
