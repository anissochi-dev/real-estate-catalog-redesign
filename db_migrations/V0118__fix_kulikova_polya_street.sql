-- Добавляем последнюю пропущенную улицу из реальных объектов
INSERT INTO t_p71821556_real_estate_catalog_.street_district_map (street_pattern, district, house_from, house_to) VALUES
('Куликова Поля', 'Российский п.', NULL, NULL),
('1-й проезд Куликова Поля', 'Российский п.', NULL, NULL)
ON CONFLICT DO NOTHING;
