ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS seo_faq jsonb DEFAULT NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.seo_faq
  IS 'Кешированный FAQ объекта — массив [{question, answer}], генерируется GPT';

CREATE INDEX IF NOT EXISTS listings_seo_faq_null_idx
  ON t_p71821556_real_estate_catalog_.listings (id)
  WHERE seo_faq IS NULL;