-- Исправление района объекта id=133 (ул. Прудовая, 24/1)
-- lat=45.048, lng=39.155 — координаты указывают на посёлок Знаменский, не ЦМР
-- Подтверждено через DaData geocoding: settlement = "поселок Знаменский"
UPDATE t_p71821556_real_estate_catalog_.listings
SET district = 'Знаменский',
    updated_at = NOW()
WHERE id = 133 AND district = 'Центральный (ЦМР)';
