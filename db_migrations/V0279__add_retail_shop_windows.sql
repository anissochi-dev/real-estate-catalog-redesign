ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS has_shop_windows boolean;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.has_shop_windows IS 'Витринные окна (для категории "Торговая площадь", тег ЦИАН HasShopWindows)';
