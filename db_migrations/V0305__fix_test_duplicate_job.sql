-- Приводим тестовые данные в порядок: помечаем случайно созданный дубль-джоб как отменённый,
-- очищаем active_job_id, возвращаем last_run_at к реальному текущему моменту.
UPDATE t_p71821556_real_estate_catalog_.news_gen_jobs
SET status = 'error', error = 'Отменено: тестовый дубль-джоб (баг гонки состояний, исправлен в коде)'
WHERE id = 2 AND status = 'pending';

UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET active_job_id = NULL, last_run_at = NOW()
WHERE id = 1;
