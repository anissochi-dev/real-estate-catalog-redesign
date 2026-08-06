ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds
  ADD COLUMN custom_phone VARCHAR(20) NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.xml_feeds.custom_phone IS
  'Подменный телефон для этого фида — если задан, используется в выгрузке вместо company_phone из settings';