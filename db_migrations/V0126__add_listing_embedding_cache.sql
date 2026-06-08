-- Кеш эмбеддингов для семантического поиска
ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS embedding float8[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.embedding IS 'Yandex Text Embeddings вектор для семантического поиска';
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.embedding_updated_at IS 'Время последнего пересчёта эмбеддинга';
