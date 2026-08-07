INSERT INTO t_p71821556_real_estate_catalog_.xml_feeds
  (slug, name, format, is_active, filter_category, filter_deal, market_category_map, use_jpg_photos, max_listings, custom_phone)
SELECT
  'yml', 'YML', format, is_active, filter_category, filter_deal, market_category_map, use_jpg_photos, max_listings, custom_phone
FROM t_p71821556_real_estate_catalog_.xml_feeds
WHERE id = 49;