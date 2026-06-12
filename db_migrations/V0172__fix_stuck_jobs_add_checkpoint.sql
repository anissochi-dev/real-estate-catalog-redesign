-- Сбрасываем зависшие jobs которые застряли в running/downloading дольше 10 минут
UPDATE t_p71821556_real_estate_catalog_.import_jobs
SET status = 'error',
    error_msg = 'Прервано: функция завершилась по таймауту. Запустите импорт заново.'
WHERE status IN ('running', 'downloading', 'parsing', 'pending')
  AND updated_at < NOW() - INTERVAL '10 minutes';

-- Добавляем колонку checkpoint для побатчевой обработки больших файлов
ALTER TABLE t_p71821556_real_estate_catalog_.import_jobs
  ADD COLUMN IF NOT EXISTS checkpoint_row INTEGER NOT NULL DEFAULT 0;
