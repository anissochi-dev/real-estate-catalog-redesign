-- Исправление конфликтных улиц в street_district_map
-- Источник: аудит по координатам объектов через 2GIS/DaData + проверка lat/lng

-- 1. Дальняя, 1к13 → Фестивальный (lat=45.063, lng=38.982)
--    Малые номера Дальней — ФМР
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 50
WHERE street_pattern = 'Дальняя' AND district = 'Фестивальный (ФМР)'
  AND house_from IS NULL AND house_to IS NULL;

-- 2. Гомельская, 3 → Музыкальный (lat=45.086, lng=39.004)
--    Малые номера Гомельской — Музыкальный
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 30
WHERE street_pattern = 'Гомельская' AND district = 'Музыкальный'
  AND house_from IS NULL AND house_to IS NULL;

-- 3. Академика Лукьяненко, 35 → Кожзавод (lat=45.056, lng=38.911)
--    Приоритет Кожзаводу для домов 1-100
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 100
WHERE street_pattern = 'Академика Лукьяненко' AND district = 'Кожевенный завод (Кожзавод)'
  AND house_from IS NULL AND house_to IS NULL;

-- 4. Прудовая — дубль ЦМР: один оставляем для малых номеров, второй переключаем на Знаменский
--    id=133 Прудовая 24/1 → Знаменский (lng=39.155 — далеко на восток)
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 15
WHERE street_pattern = 'Прудовая' AND district = 'Центральный (ЦМР)'
  AND id = (
    SELECT MIN(id) FROM t_p71821556_real_estate_catalog_.street_district_map
    WHERE street_pattern = 'Прудовая' AND district = 'Центральный (ЦМР)'
  );

-- Второй дубль Прудовой переключаем на Знаменский с высокими номерами
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET district = 'Знаменский', house_from = 16, house_to = NULL
WHERE street_pattern = 'Прудовая' AND district = 'Центральный (ЦМР)'
  AND house_from IS NULL AND house_to IS NULL;

-- 5. Старокубанская, 123к2 → Черёмушки (ЧМР) (lat=45.016, lng=39.047)
--    Высокие номера Старокубанской — ЧМР; малые (< 100) — ГМР
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 99
WHERE street_pattern = 'Старокубанская' AND district = 'Гидростроителей (ГМР)'
  AND house_from IS NULL AND house_to IS NULL;

-- Добавляем запись: Старокубанская 100+ → Черёмушки (ЧМР)
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map
  (street_pattern, district, house_from, house_to)
VALUES ('Старокубанская', 'Черёмушки (ЧМР)', 100, NULL);

-- 6. Красных Партизан, 163 → МХГ (lat=45.059, lng=38.926)
--    Текущие диапазоны: до 299 = КМР, от 300 = ФМР
--    Дом 163 попадает в КМР, но реально это МХГ (граничная зона)
--    Добавляем уточняющий диапазон: 100-200 = МХГ
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map
  (street_pattern, district, house_from, house_to)
VALUES ('Красных Партизан', 'Микрохирургия глаза (МХГ)', 100, 200);
