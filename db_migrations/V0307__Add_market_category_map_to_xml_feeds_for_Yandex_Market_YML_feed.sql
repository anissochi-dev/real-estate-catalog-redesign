ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds
  ADD COLUMN IF NOT EXISTS market_category_map TEXT;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.xml_feeds.market_category_map IS
  'JSON-словарь: категория объекта (purposes.slug либо стандартная category listings) -> market_category_id из кабинета продавца Яндекс.Маркета. Используется только для формата market (YML-фид товаров).';
