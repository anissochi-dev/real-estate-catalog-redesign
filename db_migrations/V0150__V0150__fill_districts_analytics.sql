UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 5.0, ranking = 10, notes = 'Деловой и исторический центр, Красная ул, максимальный трафик и статус'
WHERE name ILIKE '%центр%' AND is_okrug = FALSE;

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 4.5, ranking = 9, notes = 'Элитный микрорайон у реки, состоятельная аудитория, премиальный спрос'
WHERE name ILIKE '%юмр%' OR name ILIKE '%юбилейн%';

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 5.0, ranking = 8, notes = 'Зелёный престижный район, развитая инфраструктура, высокий спрос'
WHERE name ILIKE '%фмр%' OR name ILIKE '%фестивальн%';

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 8.0, ranking = 7, notes = 'Современный активно развивающийся микрорайон, спрос на базовые сервисы'
WHERE name ILIKE '%гмр%' OR name ILIKE '%губернск%';

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 12.0, ranking = 4, notes = 'Удалённый микрорайон, бюджетный вход в коммерцию, долгосрочный потенциал'
WHERE name ILIKE '%пашков%';

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 8.5, ranking = 5, notes = 'Рядом с центром и вокзалом, высокий трафик, много объектов старого фонда'
WHERE name ILIKE '%дубинк%';

UPDATE t_p71821556_real_estate_catalog_.districts
SET vacancy_rate = 7.0, ranking = 6, notes = 'Спокойный район, хорошая транспортная доступность'
WHERE name ILIKE '%черемуш%';
