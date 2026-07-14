-- Исправление часового пояса: 01:30 МСК = 22:30 UTC (МСК = UTC+3).
-- Раньше indexation_cron_hour=1 сравнивался напрямую с now_utc.hour,
-- что фактически запускало пересчёт в 04:30 МСК вместо 01:30 МСК.
ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ALTER COLUMN indexation_cron_hour SET DEFAULT 22;

UPDATE t_p71821556_real_estate_catalog_.settings
SET indexation_cron_hour = 22, indexation_cron_minute = 30
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id LIMIT 1);