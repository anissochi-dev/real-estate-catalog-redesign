-- Точечные исправления по координатам (финальный раунд)

-- 1. Красных Партизан 180 → КМР (lat=45.050, lng=38.961)
--    МХГ занимает примерно дома 100-160 (западнее), 161+ → КМР
--    Сужаем диапазон МХГ до 100-160
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_to = 160
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Микрохирургия глаза (МХГ)'
  AND house_from = 100 AND house_to = 200;

-- КМР: дома 161-299 (обновляем нижнюю границу)
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET house_from = 161
WHERE street_pattern = 'Красных Партизан'
  AND district = 'Комсомольский (КМР)'
  AND house_from = 201 AND house_to = 299;

-- 2. Думенко 27 → по координатам (lat=45.036, lng=38.916) это Кожзавод/Славянский
--    Исправляем район объекта id=189 напрямую в listings
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = 'Кожевенный завод (Кожзавод)', updated_at = NOW()
WHERE id = 189 AND district = 'Юбилейный (ЮМР)';

-- Также фиксируем справочник: Думенко 1-50 = Кожзавод (уже есть ГМР 1-50, меняем)
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET district = 'Кожевенный завод (Кожзавод)'
WHERE street_pattern = 'Думенко'
  AND district = 'Гидростроителей (ГМР)'
  AND house_from = 1 AND house_to = 50;
