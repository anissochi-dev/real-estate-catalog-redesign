-- Индекс для основной сортировки публичного каталога: last_edited_at + updated_at + id
-- Покрывает ORDER BY в fetchListings(30, 0) — ускоряет первый запрос главной страницы
CREATE INDEX IF NOT EXISTS idx_listings_public_sort
ON t_p71821556_real_estate_catalog_.listings (last_edited_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC)
WHERE status = 'active' AND (is_visible IS NULL OR is_visible = TRUE);