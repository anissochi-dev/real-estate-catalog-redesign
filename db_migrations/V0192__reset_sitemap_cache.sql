-- Сбрасываем кеш sitemap чтобы он пересобрался при следующем запросе
UPDATE t_p71821556_real_estate_catalog_.seo_artifacts
SET updated_at = '2000-01-01 00:00:00+00'
WHERE kind = 'sitemap';