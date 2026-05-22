ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS building_class character varying(10) NULL,
  ADD COLUMN IF NOT EXISTS subway_station character varying(150) NULL,
  ADD COLUMN IF NOT EXISTS subway_distance integer NULL,
  ADD COLUMN IF NOT EXISTS land_area numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS land_status character varying(100) NULL,
  ADD COLUMN IF NOT EXISTS has_furniture boolean NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_equipment boolean NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS property_rights character varying(30) NULL,
  ADD COLUMN IF NOT EXISTS min_area numeric(8,2) NULL,
  ADD COLUMN IF NOT EXISTS building_year integer NULL,
  ADD COLUMN IF NOT EXISTS is_apartments boolean NULL DEFAULT false;
