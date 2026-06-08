-- Добавляем parent_id для иерархии округ → микрорайон
ALTER TABLE t_p71821556_real_estate_catalog_.districts
    ADD COLUMN IF NOT EXISTS parent_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_districts_parent_id
    ON t_p71821556_real_estate_catalog_.districts(parent_id);

-- Добавляем 4 официальных округа Краснодара (level = 1)
-- is_active = TRUE, parent_id = NULL (верхний уровень)
INSERT INTO t_p71821556_real_estate_catalog_.districts
    (name, slug, city, sort_order, is_active, description)
VALUES
    ('Центральный округ',   'centralnyy-okrug',    'Краснодар', 1,  TRUE, 'Центральный внутригородской округ Краснодара'),
    ('Прикубанский округ',  'prikubanskiy-okrug',  'Краснодар', 2,  TRUE, 'Прикубанский внутригородской округ Краснодара'),
    ('Карасунский округ',   'karasunsky-okrug-v2', 'Краснодар', 3,  TRUE, 'Карасунский внутригородской округ Краснодара'),
    ('Западный округ',      'zapadnyy-okrug',       'Краснодар', 4,  TRUE, 'Западный внутригородской округ Краснодара')
ON CONFLICT (slug) DO NOTHING;
