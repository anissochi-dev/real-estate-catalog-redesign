-- Колонка broker_id для заявок: кто из брокеров владелец-приёмщик заявки
-- (используется для ограничения видимости телефона собственника)
ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS broker_id INTEGER REFERENCES t_p71821556_real_estate_catalog_.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_broker_id
  ON t_p71821556_real_estate_catalog_.leads(broker_id);

-- Бэкфилл: для заявок, привязанных к объекту с broker_id — переносим
UPDATE t_p71821556_real_estate_catalog_.leads l
SET broker_id = ls.broker_id
FROM t_p71821556_real_estate_catalog_.listings ls
WHERE l.listing_id = ls.id
  AND l.broker_id IS NULL
  AND ls.broker_id IS NOT NULL;