-- Объявление ID=127 не имеет фотографии — временно скрываем из каталога
-- Администратор должен добавить фото и вернуть is_visible = TRUE
UPDATE t_p71821556_real_estate_catalog_.listings
SET is_visible = FALSE, updated_at = NOW()
WHERE id = 127 AND (image IS NULL OR image = '');