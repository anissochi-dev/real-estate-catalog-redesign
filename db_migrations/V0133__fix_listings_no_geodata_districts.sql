-- Исправление районов для объектов из no_geodata по координатам

-- id=121: Ростовское шоссе 22/3 (lat=45.086, lng=38.990)
-- Ростовское шоссе, дом 22 — северная часть, район Табачная фабрика / ТЭЦ / Витаминкомбинат
-- lng=38.990 → Табачная фабрика (ТФ)
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = 'Табачная фабрика (Табачка)', updated_at = NOW()
WHERE id = 121 AND district = 'Центральный (ЦМР)';

-- id=125: 1 Мая, 307 (lat=45.077, lng=39.020)
-- Улица 1 Мая 307 — высокий номер, северо-восточная часть → 40 лет Победы
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = '40 лет Победы', updated_at = NOW()
WHERE id = 125 AND district = 'Центральный (ЦМР)';

-- id=172: 1 Мая, 307 — те же координаты что id=125
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = '40 лет Победы', updated_at = NOW()
WHERE id = 172 AND district = 'Центральный (ЦМР)';

-- Добавляем Ростовское шоссе в справочник
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map
  (street_pattern, district, house_from, house_to)
VALUES
  ('Ростовское шоссе', 'Центральный (ЦМР)', 1, 15),
  ('Ростовское шоссе', 'Табачная фабрика (Табачка)', 16, NULL);

-- Добавляем улицу 1 Мая с диапазонами
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map
  (street_pattern, district, house_from, house_to)
VALUES
  ('1 Мая', 'Центральный (ЦМР)', 1, 200),
  ('1 Мая', '40 лет Победы', 201, NULL);
