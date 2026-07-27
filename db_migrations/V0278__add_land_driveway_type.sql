ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS driveway_type varchar(20);

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.driveway_type IS 'Подъездные пути к земельному участку: asphalt/ground/none (для выгрузки ЦИАН Land.DrivewayType)';
