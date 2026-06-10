UPDATE t_p71821556_real_estate_catalog_.settings
SET vb_retrain_sources = '["news", "listings", "invest", "demand", "terms", "market_prices", "biweekly_history", "market_history"]'::jsonb
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id LIMIT 1);