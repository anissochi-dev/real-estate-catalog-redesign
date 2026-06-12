-- Сбрасываем незавершённые jobs чтобы начать заново с правильными фильтрами
UPDATE t_p71821556_real_estate_catalog_.import_jobs
SET status = 'error',
    error_msg = 'Сброшен: перезапуск с фильтром только коммерческой недвижимости',
    updated_at = NOW()
WHERE status IN ('running', 'paused', 'pending');
