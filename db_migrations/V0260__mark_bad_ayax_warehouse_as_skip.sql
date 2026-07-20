UPDATE t_p71821556_real_estate_catalog_.market_listings
SET category = 'residential_skip'
WHERE source = 'ayax.ru' AND category = 'warehouse' AND deal_type = 'rent' AND price_per_m2 > 10000;