INSERT INTO t_p71821556_real_estate_catalog_.cron_jobs (name, title, priority, interval_sec, run_hour, needs_auth, enabled)
VALUES ('storage_cleanup', 'Удаление просроченных файлов для печати', 7, 86400, 3, FALSE, TRUE)
ON CONFLICT (name) DO NOTHING;