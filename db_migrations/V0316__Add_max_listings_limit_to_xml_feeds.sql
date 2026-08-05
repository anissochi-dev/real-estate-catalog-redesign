ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds
ADD COLUMN max_listings INTEGER NULL;

UPDATE t_p71821556_real_estate_catalog_.xml_feeds
SET max_listings = 100
WHERE slug = 'doskaru';
