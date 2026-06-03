-- Справочник районов. Используется для навигации, фильтрации и страниц-хабов.
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.districts (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,          -- отображаемое название: «Прикубанский»
    slug        VARCHAR(100) NOT NULL UNIQUE,   -- URL-slug: «pridubanskiy»
    city        VARCHAR(100) NOT NULL DEFAULT 'Краснодар',
    description TEXT,                           -- краткое описание для страницы района
    sort_order  SMALLINT NOT NULL DEFAULT 100,
    is_active   BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Дефолтные районы Краснодара
INSERT INTO t_p71821556_real_estate_catalog_.districts
    (name, slug, city, sort_order)
VALUES
    ('Центральный',    'tsentralnyy',   'Краснодар', 10),
    ('Карасунский',    'karasunsky',    'Краснодар', 20),
    ('Прикубанский',   'prikubansky',   'Краснодар', 30),
    ('Западный',       'zapadny',       'Краснодар', 40),
    ('ФМР',            'fmr',           'Краснодар', 50),
    ('Гидрострой',     'gidrostroy',    'Краснодар', 60),
    ('Юбилейный',      'yubileynyy',    'Краснодар', 70),
    ('Музыкальный',    'muzykalnyy',    'Краснодар', 80),
    ('Восточный',      'vostochny',     'Краснодар', 90)
ON CONFLICT (slug) DO NOTHING;

-- Индексы
CREATE INDEX IF NOT EXISTS districts_city_active_idx
    ON t_p71821556_real_estate_catalog_.districts (city, is_active, sort_order);
