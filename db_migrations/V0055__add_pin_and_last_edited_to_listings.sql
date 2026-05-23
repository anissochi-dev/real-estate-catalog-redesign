-- Поля для закрепления объектов и отметки реального ручного редактирования
ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_edited_by INTEGER,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by INTEGER;

-- Индексы для быстрой сортировки на главной/каталоге
CREATE INDEX IF NOT EXISTS idx_listings_pin_sort
  ON t_p71821556_real_estate_catalog_.listings (is_pinned DESC, pinned_at DESC, last_edited_at DESC, updated_at DESC, id DESC)
  WHERE status = 'active';
