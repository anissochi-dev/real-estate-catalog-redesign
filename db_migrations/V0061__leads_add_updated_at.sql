-- Добавляем updated_at в leads для сортировки «по последнему редактированию»
ALTER TABLE t_p71821556_real_estate_catalog_.leads
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Заполняем существующие строки значениями из created_at
UPDATE t_p71821556_real_estate_catalog_.leads
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

-- Индекс для быстрой сортировки публичного списка заявок
CREATE INDEX IF NOT EXISTS idx_leads_show_main_updated
  ON t_p71821556_real_estate_catalog_.leads (show_on_main, updated_at DESC NULLS LAST)
  WHERE show_on_main = TRUE;
