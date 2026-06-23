-- Приводим данные к консистентности: неактивные объекты не должны быть видимыми.
-- Закрывает текущий рассинхрон (в т.ч. объект 82: archived + is_visible=true).
UPDATE t_p71821556_real_estate_catalog_.listings
SET is_visible = FALSE
WHERE status <> 'active' AND (is_visible IS NULL OR is_visible = TRUE);