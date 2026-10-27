INSERT INTO t_p71821556_real_estate_catalog_.cron_jobs (name, title, priority, interval_sec, run_hour, needs_auth, enabled)
VALUES ('vk_market', 'Синхронизация товаров ВК Маркета', 25, 1800, NULL, FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;