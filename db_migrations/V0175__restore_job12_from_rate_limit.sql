-- Восстанавливаем job #12 который остановился на rate limit — продолжаем с checkpoint 20000
UPDATE t_p71821556_real_estate_catalog_.import_jobs
SET status = 'running',
    error_msg = NULL,
    updated_at = NOW()
WHERE id = 12 AND status = 'error' AND checkpoint_row = 20000;
