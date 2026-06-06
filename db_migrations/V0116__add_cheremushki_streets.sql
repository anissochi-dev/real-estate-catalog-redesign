-- Добавляем улицы для района "Черёмушки" (без ЧМР — отдельный посёлок Черёмушки)
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map (street_pattern, district, house_from, house_to) VALUES
('Черёмушки', 'Черёмушки', NULL, NULL),
('Черёмуховая', 'Черёмушки', NULL, NULL),
('Вишнёвая', 'Черёмушки', NULL, NULL),
('Садовая', 'Черёмушки', NULL, NULL),
('Цветочная', 'Черёмушки', NULL, NULL),
('Зелёная', 'Черёмушки', NULL, NULL),
('Луговая', 'Черёмушки', NULL, NULL),
('Полевая', 'Черёмушки', NULL, NULL),
('Центральная', 'Черёмушки', NULL, NULL),
('Совхозная', 'Черёмушки', NULL, NULL)
ON CONFLICT DO NOTHING;
