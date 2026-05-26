ALTER TABLE t_p71821556_real_estate_catalog_.news
  ADD COLUMN IF NOT EXISTS cb_key_rate NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.news.cb_key_rate
  IS 'Ключевая ставка ЦБ РФ на момент создания статьи (% годовых)';