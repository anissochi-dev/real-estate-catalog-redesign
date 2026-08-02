-- Повторный тест полного цикла после исправления фокуса темы и объёма статьи.
UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET last_run_at = NOW() - INTERVAL '25 hours', active_job_id = NULL
WHERE id = 1;
