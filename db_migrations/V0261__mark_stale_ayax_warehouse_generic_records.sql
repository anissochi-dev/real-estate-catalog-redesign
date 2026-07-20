UPDATE t_p71821556_real_estate_catalog_.market_listings
SET category = 'residential_skip'
WHERE source = 'ayax.ru' AND category = 'warehouse'
  AND title ~ '^warehouse (rent|sale) [0-9.]+ м²$';