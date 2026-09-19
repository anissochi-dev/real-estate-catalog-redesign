-- Возвращаем постоянное расписание на 23:30 МСК (20:30 UTC) после разового
-- немедленного прогона в предыдущей миграции.
UPDATE t_p71821556_real_estate_catalog_.settings
SET feed_bump_cron_hour = 20, feed_bump_cron_minute = 30;
