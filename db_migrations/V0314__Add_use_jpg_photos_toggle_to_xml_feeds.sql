ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds
ADD COLUMN use_jpg_photos BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE t_p71821556_real_estate_catalog_.xml_feeds
SET use_jpg_photos = TRUE
WHERE slug IN ('23estate', 'gdeetotdom', 'remospro', 'akula');
