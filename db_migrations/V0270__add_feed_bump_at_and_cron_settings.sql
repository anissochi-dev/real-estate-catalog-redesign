ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS feed_bump_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS feed_bump_cron_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS feed_bump_cron_hour INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS feed_bump_cron_minute INTEGER NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS feed_bump_cron_last_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.feed_bump_at IS 'Служебная дата "поднятия" объекта для XML-фидов площадок (Яндекс/Авито/ЦИАН). НЕ влияет на updated_at, сортировку сайта и историю редактирования.';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.settings.feed_bump_cron_hour IS 'Час запуска авто-обновления даты в фидах, UTC. По умолчанию 6 = 09:00 МСК.';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.settings.feed_bump_cron_minute IS 'Минута запуска авто-обновления даты в фидах, UTC. По умолчанию 23 => 09:23 МСК.';
