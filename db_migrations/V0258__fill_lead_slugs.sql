UPDATE t_p71821556_real_estate_catalog_.leads
SET slug = (
  CASE
    WHEN property_type = 'rent' THEN 'arenda-'
    WHEN property_type = 'sale' THEN 'prodazha-'
    ELSE ''
  END
  ||
  CASE property_category
    WHEN 'office' THEN 'ofis-'
    WHEN 'retail' THEN 'magazin-'
    WHEN 'warehouse' THEN 'sklad-'
    WHEN 'restaurant' THEN 'obschepit-'
    WHEN 'hotel' THEN 'gostinitsa-'
    WHEN 'business' THEN 'gotovyi-biznes-'
    WHEN 'gab' THEN 'gab-'
    WHEN 'production' THEN 'proizvodstvo-'
    WHEN 'land' THEN 'zemlya-'
    WHEN 'building' THEN 'zdanie-'
    WHEN 'free_purpose' THEN 'svobodnogo-naznacheniya-'
    WHEN 'car_service' THEN 'avtoservis-'
    ELSE ''
  END
  || id
)
WHERE slug IS NULL;

-- Фикс на случай если и type, и category пустые (не должно произойти, но подстрахуемся)
UPDATE t_p71821556_real_estate_catalog_.leads
SET slug = 'zayavka-' || id
WHERE slug IS NULL OR slug = '' OR slug LIKE '-%';