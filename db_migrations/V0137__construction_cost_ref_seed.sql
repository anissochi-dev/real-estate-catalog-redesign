INSERT INTO t_p71821556_real_estate_catalog_.construction_cost_ref
    (category, quality_class, cost_per_m2, notes)
SELECT category, quality_class, cost_per_m2, notes FROM (VALUES
('office',       'A', 95000::numeric,  'Класс А: монолит, вентфасад, BMS, паркинг'),
('office',       'B', 65000::numeric,  'Класс B: монолит/кирпич, стандартная инженерия'),
('office',       'C', 42000::numeric,  'Класс C: старый фонд, минимальная инженерия'),
('retail',       'A', 90000::numeric,  'ТРЦ: атриум, эскалаторы, фудкорт'),
('retail',       'B', 60000::numeric,  'Торговый центр районного формата'),
('retail',       'C', 38000::numeric,  'Встроенный ритейл, минимальная отделка'),
('warehouse',    'A', 48000::numeric,  'Класс A: высота 12+м, ворота докового типа'),
('warehouse',    'B', 32000::numeric,  'Класс B: высота 6-9м, погрузочные рампы'),
('warehouse',    'C', 20000::numeric,  'Класс C: ангар/холодный склад'),
('restaurant',   'B', 85000::numeric,  'Кафе/ресторан с кухонным блоком'),
('restaurant',   'C', 55000::numeric,  'Фастфуд, столовая'),
('hotel',        'A', 130000::numeric, '4-5 звёзд: бассейн, СПА, конференц'),
('hotel',        'B', 80000::numeric,  '3 звезды, стандартный бизнес-отель'),
('hotel',        'C', 50000::numeric,  'Мини-отель, хостел'),
('production',   'B', 35000::numeric,  'Производственный цех'),
('production',   'C', 22000::numeric,  'Лёгкое производство, ангар'),
('free_purpose', 'B', 55000::numeric,  'ПСН универсальное'),
('free_purpose', 'C', 35000::numeric,  'ПСН базовое'),
('building',     'B', 58000::numeric,  'Отдельно стоящее здание'),
('building',     'C', 38000::numeric,  'Старый фонд')
) AS t(category, quality_class, cost_per_m2, notes)
WHERE NOT EXISTS (
    SELECT 1 FROM t_p71821556_real_estate_catalog_.construction_cost_ref r
    WHERE r.category = t.category AND r.quality_class = t.quality_class
      AND r.region = 'Краснодар' AND r.valid_year = 2025
);
