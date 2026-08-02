-- Временный сброс для тестирования нового асинхронного механизма генерации (шаг проверки).
UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET last_run_at = NOW() - INTERVAL '25 hours'
WHERE id = 1;
