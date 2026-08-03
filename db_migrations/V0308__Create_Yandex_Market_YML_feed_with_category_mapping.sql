INSERT INTO t_p71821556_real_estate_catalog_.xml_feeds (name, slug, format, is_active, market_category_map)
SELECT 'Яндекс.Маркет (товары)', 'yandex-market-tovary', 'market', TRUE,
  '{"office":"41","retail":"42","free_purpose":"43","warehouse":"44","production":"45","land":"46","restaurant":"47","car_service":"48","hotel":"49","business":"50","gab":"50","building":"43"}'
WHERE NOT EXISTS (SELECT 1 FROM t_p71821556_real_estate_catalog_.xml_feeds WHERE format = 'market');
