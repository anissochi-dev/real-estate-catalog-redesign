-- /favorites и /compare не должны индексироваться — персональные страницы без SEO-ценности
UPDATE t_p71821556_real_estate_catalog_.seo_pages
SET noindex = TRUE, updated_at = NOW()
WHERE path IN ('/favorites', '/compare');