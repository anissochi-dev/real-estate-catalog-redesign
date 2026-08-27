INSERT INTO t_p71821556_real_estate_catalog_.xml_feeds (name, slug, format, is_active, market_category_map)
SELECT 'VK Товары', 'vk', 'market_vk', TRUE, '{"*":"505"}'
WHERE NOT EXISTS (SELECT 1 FROM t_p71821556_real_estate_catalog_.xml_feeds WHERE slug = 'vk');