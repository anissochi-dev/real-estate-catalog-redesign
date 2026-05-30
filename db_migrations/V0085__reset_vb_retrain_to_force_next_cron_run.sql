-- Сбрасываем дату последнего запуска и прогресс чтобы переобучение запустилось при следующем cron-вызове
UPDATE t_p71821556_real_estate_catalog_.settings
SET vb_retrain_last_at = '2000-01-01 00:00:00',
    vb_retrain_last_status = '{"in_progress": false, "done_sources": [], "total_saved": 0}'
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id LIMIT 1);