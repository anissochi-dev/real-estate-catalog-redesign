-- Красных Партизан: расширяем МХГ до дома 170 включительно
-- id=79 (дом 163, lng=38.926) подтверждает МХГ по координатам
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_to = 170
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Микрохирургия глаза (МХГ)'
  AND house_from = 100 AND house_to = 160;

-- КМР начинается с 171
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 171
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Комсомольский (КМР)'
  AND house_from = 161;
