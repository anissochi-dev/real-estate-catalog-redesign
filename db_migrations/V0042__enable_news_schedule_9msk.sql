INSERT INTO t_p71821556_real_estate_catalog_.news_schedule (is_enabled, run_hour, articles_per_run)
SELECT TRUE, 6, 3
WHERE NOT EXISTS (SELECT 1 FROM t_p71821556_real_estate_catalog_.news_schedule);

UPDATE t_p71821556_real_estate_catalog_.news_schedule SET is_enabled = TRUE, run_hour = 6, articles_per_run = 3, updated_at = NOW() WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.news_schedule ORDER BY id LIMIT 1)
