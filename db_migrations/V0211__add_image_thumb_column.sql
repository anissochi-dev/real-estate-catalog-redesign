-- Мобильная версия обложки (800px WebP quality=70) для ускорения каталога на мобиле
ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS image_thumb TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_image_thumb
  ON t_p71821556_real_estate_catalog_.listings (id)
  WHERE image_thumb IS NOT NULL;
