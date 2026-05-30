-- Инвалидируем кэш NOI-бенчмарков для объекта 153 (был закэширован с неверным типом 'office' вместо 'building')
-- и заодно чистим все кэши где source = 'fallback' со старыми дефолтами
UPDATE t_p71821556_real_estate_catalog_.noi_benchmarks_cache
SET expires_at = '2000-01-01 00:00:00'
WHERE listing_id = 153;