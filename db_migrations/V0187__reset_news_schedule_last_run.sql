UPDATE t_p71821556_real_estate_catalog_.news_schedule 
SET last_run_at = NOW() - INTERVAL '2 days'
WHERE id = 1;