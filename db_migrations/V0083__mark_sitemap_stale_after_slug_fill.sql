-- Помечаем sitemap как устаревший — функция пересоберёт при следующем вызове sitemap_rebuild
UPDATE t_p71821556_real_estate_catalog_.seo_artifacts 
SET updated_at = '2000-01-01 00:00:00', urls_count = 0
WHERE kind = 'sitemap';