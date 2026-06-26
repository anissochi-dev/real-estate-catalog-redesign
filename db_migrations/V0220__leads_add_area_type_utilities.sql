ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS area_from integer NULL,
  ADD COLUMN IF NOT EXISTS area_to integer NULL,
  ADD COLUMN IF NOT EXISTS property_type varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS property_category varchar(50) NULL,
  ADD COLUMN IF NOT EXISTS utilities text NULL;