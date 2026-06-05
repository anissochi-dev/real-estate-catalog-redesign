-- Добавляем поля для диапазонного маппинга по номеру дома
ALTER TABLE t_p71821556_real_estate_catalog_.street_district_map 
ADD COLUMN IF NOT EXISTS house_from INT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS house_to INT DEFAULT NULL;

-- Ставропольская: уточняем по номерам
-- до ~200 — ЦМР, 200-300 — КМР, 300+ — ЧМР
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET district = 'Центральный (ЦМР)', house_from = NULL, house_to = 199
WHERE street_pattern = 'Ставропольская' AND id = 10;

INSERT INTO t_p71821556_real_estate_catalog_.street_district_map (street_pattern, district, house_from, house_to)
VALUES 
  ('Ставропольская', 'Комсомольский (КМР)', 200, 299),
  ('Ставропольская', 'Черёмушки (ЧМР)', 300, NULL);

-- Красных Партизан: до 300 — КМР, 300+ — ФМР  
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = NULL, house_to = 299
WHERE street_pattern = 'Красных Партизан' AND id = 40;

INSERT INTO t_p71821556_real_estate_catalog_.street_district_map (street_pattern, district, house_from, house_to)
VALUES ('Красных Партизан', 'Фестивальный (ФМР)', 300, NULL);

-- Мачуги: до 70 — Юбилейный, 70+ — 40 лет Победы
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = NULL, house_to = 69
WHERE street_pattern = 'Мачуги' AND district = 'Юбилейный (ЮМР)';

INSERT INTO t_p71821556_real_estate_catalog_.street_district_map (street_pattern, district, house_from, house_to)
VALUES ('Мачуги', '40 лет Победы', 70, NULL);
