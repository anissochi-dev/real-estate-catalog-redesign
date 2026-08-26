ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS additional_categories VARCHAR(150) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_vat BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_auction BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_share_sale BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS building_type VARCHAR(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rent_holidays BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS avito_utilities_included BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_months VARCHAR(10) DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.additional_categories IS 'Доп. категории объекта для Авито, до 2 значений через | (напр. office|retail)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.has_vat IS 'НДС: true=да, false=нет, NULL=не указано';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.is_auction IS 'Продажа через аукцион (Авито)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.is_share_sale IS 'Продажа доли (Авито)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.building_type IS 'Тип здания для Авито: business_center, shopping_center, admin_building, residential, other';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.rent_holidays IS 'Арендные каникулы (Авито)';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.avito_utilities_included IS 'Эксплуатационные расходы включены — отдельно от utilities_included (ЦИАН), для Авито';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.deposit_months IS 'Залог в месяцах для Авито: none, 0.5, 1, 1.5, 2, 2.5, 3';
