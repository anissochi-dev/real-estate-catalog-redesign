-- Переводим старый тестовый джоб (со статусом устаревшего 'finding_topic') в новый
-- первый шаг раздробленной цепочки 'search_wide', и снова открываем окно автозапуска.
UPDATE t_p71821556_real_estate_catalog_.news_gen_jobs
SET status = 'search_wide', updated_at = NOW()
WHERE status = 'finding_topic';

UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET last_run_at = NOW() - INTERVAL '25 hours', active_job_id = (SELECT id FROM t_p71821556_real_estate_catalog_.news_gen_jobs ORDER BY id DESC LIMIT 1)
WHERE id = 1;
