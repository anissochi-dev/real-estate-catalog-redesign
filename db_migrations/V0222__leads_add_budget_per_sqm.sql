ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS budget_per_sqm_from integer NULL,
  ADD COLUMN IF NOT EXISTS budget_per_sqm_to integer NULL;