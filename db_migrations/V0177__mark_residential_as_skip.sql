-- Помечаем жилые объекты (квартиры) для исключения из аналитики
-- Признак: category=other + title содержит жилые маркеры + цена аренды < 100 000 (квартиры)
-- cian, manual, yandex — массово квартиры в аренде
UPDATE t_p71821556_real_estate_catalog_.market_listings
SET category = 'residential_skip'
WHERE category = 'other'
  AND source IN ('cian', 'manual', 'yandex')
  AND deal_type = 'rent'
  AND price < 100000;

-- Также помечаем по явным жилым сигналам в названии из любого источника
UPDATE t_p71821556_real_estate_catalog_.market_listings
SET category = 'residential_skip'
WHERE category = 'other'
  AND (
    title ILIKE '%квартир%'
    OR title ILIKE '%-к кв%'
    OR title ILIKE '%комнат%'
    OR title ILIKE '%студия%'
    OR title ILIKE '%таунхаус%'
    OR title ILIKE '%коттедж%'
    OR title ILIKE '%1-комнатн%'
    OR title ILIKE '%2-комнатн%'
    OR title ILIKE '%3-комнатн%'
  );
