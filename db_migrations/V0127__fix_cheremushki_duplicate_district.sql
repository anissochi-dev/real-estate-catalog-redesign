-- Фикс дубля района Черёмушки:
-- Оставляем каноничное "Черёмушки (ЧМР)", деактивируем "Черёмушки" (id=30)

-- 1. Деактивируем дубль
UPDATE t_p71821556_real_estate_catalog_.districts
SET is_active = FALSE
WHERE id = 30 AND name = 'Черёмушки';

-- 2. Переключаем правила street_district_map на каноничное название
UPDATE t_p71821556_real_estate_catalog_.street_district_map
SET district = 'Черёмушки (ЧМР)'
WHERE district = 'Черёмушки';

-- 3. Нормализуем listings (на случай если где-то проникло)
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = 'Черёмушки (ЧМР)'
WHERE district = 'Черёмушки';
