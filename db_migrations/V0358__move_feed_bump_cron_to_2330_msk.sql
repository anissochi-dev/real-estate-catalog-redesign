-- Переносим время авто-обновления даты фидов на 23:30 МСК (20:30 UTC),
-- обновляем дефолты колонок и сбрасываем feed_bump_cron_last_at,
-- чтобы обновление гарантированно сработало на ближайшем платформенном кроне
-- (учитывая новый механизм X-Cron-Token в backend/xml-feeds).

ALTER TABLE t_p71821556_real_estate_catalog_.settings
    ALTER COLUMN feed_bump_cron_hour SET DEFAULT 20;

ALTER TABLE t_p71821556_real_estate_catalog_.settings
    ALTER COLUMN feed_bump_cron_minute SET DEFAULT 30;

UPDATE t_p71821556_real_estate_catalog_.settings
SET feed_bump_cron_hour = 20,
    feed_bump_cron_minute = 30;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.settings.feed_bump_cron_hour IS
    'Час (UTC) ежедневного авто-обновления даты объектов в XML-фидах (feed_bump_at). По умолчанию 20 UTC = 23:30 МСК';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.settings.feed_bump_cron_minute IS
    'Минута (UTC) ежедневного авто-обновления даты объектов в XML-фидах (feed_bump_at). По умолчанию 30';
