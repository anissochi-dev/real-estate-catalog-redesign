CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cron_jobs (
  name VARCHAR(50) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  interval_sec INTEGER NOT NULL DEFAULT 3600,
  run_hour INTEGER NULL,
  needs_auth BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_dispatched_at TIMESTAMPTZ NULL,
  dispatch_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.cron_jobs (name, title, priority, interval_sec, run_hour, needs_auth, enabled) VALUES
  ('__global', 'Пауза между задачами', 0, 60, NULL, FALSE, TRUE),
  ('platform_sync', 'Синхронизация площадок', 10, 300, NULL, FALSE, TRUE),
  ('xml_feeds', 'Сборка XML-фидов', 20, 600, NULL, FALSE, TRUE),
  ('news', 'Новости', 30, 600, NULL, FALSE, TRUE),
  ('auto_seo', 'SEO-автоматизация', 40, 3600, NULL, FALSE, TRUE),
  ('ai_retrain', 'Переобучение ВБ', 50, 3600, NULL, FALSE, TRUE),
  ('listing_faq', 'FAQ объектов', 60, 3600, NULL, TRUE, TRUE),
  ('vb_digest', 'Ежедневная сводка ВБ', 5, 86400, 9, FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE t_p71821556_real_estate_catalog_.platform_sync_state ADD COLUMN IF NOT EXISTS last_busy_at TIMESTAMPTZ NULL;
ALTER TABLE t_p71821556_real_estate_catalog_.platform_sync_state ADD COLUMN IF NOT EXISTS busy_count INTEGER NOT NULL DEFAULT 0;

UPDATE t_p71821556_real_estate_catalog_.platform_sync_state
SET consecutive_errors = 0, last_busy_at = last_attempt_at, busy_count = 1, last_error = NULL
WHERE last_error ILIKE '%rate limit%';