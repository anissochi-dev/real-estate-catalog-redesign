UPDATE t_p71821556_real_estate_catalog_.settings
SET price_refresh_interval_days = 1
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1);