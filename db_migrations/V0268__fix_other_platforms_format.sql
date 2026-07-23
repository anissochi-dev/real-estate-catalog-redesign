-- Площадки realtymag/rucountry уже существовали (созданы вручную ранее с форматом 'yandex') —
-- переводим их в группу «Разное» (формат 'other') и приводим названия к нормальному виду.
UPDATE t_p71821556_real_estate_catalog_.xml_feeds SET format = 'other', name = 'RealtyMag' WHERE slug = 'realtymag';
UPDATE t_p71821556_real_estate_catalog_.xml_feeds SET format = 'other', name = 'RuCountry' WHERE slug = 'rucountry';
