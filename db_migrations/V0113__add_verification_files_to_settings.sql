ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS verification_files JSONB DEFAULT '[]'::jsonb;