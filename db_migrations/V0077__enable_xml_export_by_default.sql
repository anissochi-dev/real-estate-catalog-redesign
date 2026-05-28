-- По умолчанию все активные объекты должны экспортироваться во все 3 фида
-- (Яндекс.Недвижимость, Авито, ЦИАН). Менеджер может отключить экспорт
-- вручную для конкретных объектов через админку. Это устраняет ситуацию,
-- когда фиды Avito/Cian оказывались пустыми из-за дефолтов FALSE.

ALTER TABLE t_p71821556_real_estate_catalog_.listings
    ALTER COLUMN export_yandex SET DEFAULT TRUE,
    ALTER COLUMN export_avito  SET DEFAULT TRUE,
    ALTER COLUMN export_cian   SET DEFAULT TRUE;

-- Включаем экспорт для всех существующих активных объектов,
-- где экспорт ещё не включён или NULL.
UPDATE t_p71821556_real_estate_catalog_.listings
SET export_yandex = TRUE
WHERE status = 'active' AND (export_yandex IS DISTINCT FROM TRUE);

UPDATE t_p71821556_real_estate_catalog_.listings
SET export_avito = TRUE
WHERE status = 'active' AND (export_avito IS DISTINCT FROM TRUE);

UPDATE t_p71821556_real_estate_catalog_.listings
SET export_cian = TRUE
WHERE status = 'active' AND (export_cian IS DISTINCT FROM TRUE);