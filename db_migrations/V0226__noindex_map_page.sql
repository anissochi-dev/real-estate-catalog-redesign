-- Скрыть /map из индексации
UPDATE t_p71821556_real_estate_catalog_.seo_pages
SET noindex = true, updated_at = now()
WHERE path = '/map';