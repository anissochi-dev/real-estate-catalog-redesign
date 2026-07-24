UPDATE t_p71821556_real_estate_catalog_.settings 
SET feed_bump_cron_hour = 6, feed_bump_cron_minute = 23 
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id LIMIT 1);