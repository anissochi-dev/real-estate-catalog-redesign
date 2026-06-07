UPDATE t_p71821556_real_estate_catalog_.noi_benchmarks_cache
SET expires_at = NOW() - INTERVAL '1 second'
WHERE listing_id = 179;