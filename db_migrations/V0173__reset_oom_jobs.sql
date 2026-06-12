-- Сбрасываем зависшие jobs которые застряли в running дольше 5 минут
UPDATE t_p71821556_real_estate_catalog_.import_jobs
SET status = 'error',
    error_msg = 'Прервано: OOM (нехватка памяти). Файл слишком большой. Запустите импорт заново — теперь файл читается потоково.'
WHERE status IN ('running', 'downloading', 'parsing', 'pending')
  AND updated_at < NOW() - INTERVAL '5 minutes';
