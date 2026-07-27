ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS prepay_months integer,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS utilities_included boolean;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.prepay_months IS 'Предоплата при аренде, мес (для выгрузки ЦИАН PrepayMonths)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.deposit_amount IS 'Залог собственнику при аренде, руб (для выгрузки ЦИАН Deposit)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.utilities_included IS 'Коммунальные платежи включены в стоимость аренды (для выгрузки ЦИАН UtilitiesTerms/IncludedInPrice)';
