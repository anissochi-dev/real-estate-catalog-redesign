-- Площадки «Разное» — универсальные бесплатные каталоги без API (realtymag, rucountry).
-- Используют формат XML 'other' — фильтруют объекты по флагу export_other, схема выгрузки
-- как у Яндекс.Недвижимости (наиболее широко поддерживаемый универсальный формат).
-- Колонка supports_stats — поддерживает ли площадка автоматическую передачу статистики через API
-- (сейчас ни realtymag, ни rucountry такого API не предоставляют — статистика не отображается).
ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds ADD COLUMN IF NOT EXISTS supports_stats BOOLEAN DEFAULT FALSE;

INSERT INTO t_p71821556_real_estate_catalog_.xml_feeds (slug, name, format) VALUES
('realtymag', 'RealtyMag', 'other'),
('rucountry', 'RuCountry', 'other')
ON CONFLICT (slug) DO NOTHING;
