-- Флаг «Р» (Разное) — выгрузка объекта в универсальные бесплатные площадки без API-ключей
-- (realtymag, rucountry и подобные). По умолчанию включён у всех НОВЫХ объектов (в отличие
-- от export_yandex/avito/cian, которые по умолчанию выключены).
ALTER TABLE t_p71821556_real_estate_catalog_.listings ADD COLUMN IF NOT EXISTS export_other BOOLEAN DEFAULT TRUE;

-- Одноразово включаем «Р» у всех уже существующих активных объектов, чтобы они сразу
-- попали в новые площадки «Разное».
UPDATE t_p71821556_real_estate_catalog_.listings SET export_other = TRUE WHERE status = 'active';
