-- Backfill: если broker_id не назначен, но есть author_id (создатель объекта),
-- считаем создателя ответственным брокером. Устраняет ситуацию, когда на публичном
-- сайте у объекта нет телефона брокера и по ошибке подставлялся телефон собственника.
UPDATE t_p71821556_real_estate_catalog_.listings
SET broker_id = author_id
WHERE broker_id IS NULL AND author_id IS NOT NULL;