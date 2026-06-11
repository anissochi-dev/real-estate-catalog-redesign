-- V0168: Критерии поиска по соцсетям
-- Каждый критерий = набор фильтров + платформы + расписание

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.social_search_criteria (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,

    -- Платформы (массив: vk, ok, telegram)
    platforms   TEXT[] NOT NULL DEFAULT '{}',

    -- Конкретные источники (пусто = все активные)
    source_ids  TEXT[] NOT NULL DEFAULT '{}',

    -- Ключевые слова
    keywords_include  TEXT[] NOT NULL DEFAULT '{}',
    keywords_exclude  TEXT[] NOT NULL DEFAULT '{}',

    -- Фильтры по недвижимости
    deal_types   TEXT[] NOT NULL DEFAULT '{}',   -- sale, rent
    categories   TEXT[] NOT NULL DEFAULT '{}',   -- office, retail, warehouse...
    price_min    BIGINT,
    price_max    BIGINT,
    area_min     NUMERIC(10,2),
    area_max     NUMERIC(10,2),
    districts    TEXT[] NOT NULL DEFAULT '{}',

    -- Требования к посту
    require_price   BOOLEAN NOT NULL DEFAULT FALSE,
    require_area    BOOLEAN NOT NULL DEFAULT FALSE,
    require_phone   BOOLEAN NOT NULL DEFAULT FALSE,
    require_photo   BOOLEAN NOT NULL DEFAULT FALSE,
    require_address BOOLEAN NOT NULL DEFAULT FALSE,

    -- Куда отправлять найденные посты
    -- moderation | leads | listings | market
    route_to    VARCHAR(20) NOT NULL DEFAULT 'moderation',

    -- Расписание
    run_interval_hours  INTEGER NOT NULL DEFAULT 6,
    last_run_at         TIMESTAMPTZ,
    next_run_at         TIMESTAMPTZ,

    created_by  INTEGER,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_search_criteria_active
    ON t_p71821556_real_estate_catalog_.social_search_criteria (is_active, next_run_at);
