-- Финальные правки street_district_map по результатам аудита

-- 1. Красных Партизан — убираем дублирующую запись МХГ без диапазона
--    (оставляем точную: 100-200 = МХГ)
--    Переключаем запись без диапазона на "40 лет Победы" (прочие номера)
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET district = '40 лет Победы'
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Микрохирургия глаза (МХГ)'
  AND house_from IS NULL AND house_to IS NULL;

-- 2. Красных Партизан до 99 → КМР (уже есть запись до 299, уточняем)
--    Дом 163 попадает в диапазон 100-200 → МХГ — это правильно
--    Оставляем как есть, но убираем общую запись КМР до 299
--    чтобы она не конфликтовала с МХГ 100-200
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_to = 99
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Комсомольский (КМР)'
  AND house_from IS NULL AND house_to = 299;

-- Добавляем КМР для 201-299 (между МХГ и ФМР)
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map
  (street_pattern, district, house_from, house_to)
VALUES ('Красных Партизан', 'Комсомольский (КМР)', 201, 299);

-- 3. Думенко, 27 → по координатам lng=38.916 это Славянский/ГМР
--    Добавляем диапазон: дома 1-50 = Гидростроителей (ГМР)
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 1, house_to = 50
WHERE street_pattern = 'Думенко' AND district = 'Гидростроителей (ГМР)'
  AND house_from IS NULL AND house_to IS NULL;
