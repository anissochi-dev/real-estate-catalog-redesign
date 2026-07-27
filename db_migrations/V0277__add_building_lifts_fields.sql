ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS passenger_lifts integer,
  ADD COLUMN IF NOT EXISTS cargo_lifts integer;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.passenger_lifts IS 'Количество пассажирских лифтов в здании (для выгрузки ЦИАН Building.PassengerLiftsCount)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.cargo_lifts IS 'Количество грузовых лифтов в здании (для выгрузки ЦИАН Building.CargoLiftsCount)';
