UPDATE t_p71821556_real_estate_catalog_.import_jobs
SET status = 'error',
    error_msg = 'Прервано: перезапустите импорт с новым кодом (потоковое чтение).'
WHERE status IN ('running', 'pending')
  AND updated_at < NOW() - INTERVAL '3 minutes';
