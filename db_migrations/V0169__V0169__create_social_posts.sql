-- V0169: Найденные посты из соцсетей — очередь модерации

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.social_posts (
    id          SERIAL PRIMARY KEY,
    criteria_id INTEGER,   -- ссылка на social_search_criteria

    -- Источник
    platform    VARCHAR(20)  NOT NULL,
    source_id   VARCHAR(200) NOT NULL,
    post_id     VARCHAR(200) NOT NULL,
    post_url    TEXT,
    post_date   TIMESTAMPTZ,
    author_name VARCHAR(200),
    author_url  TEXT,

    -- Контент
    raw_text    TEXT,
    photos      TEXT[] NOT NULL DEFAULT '{}',

    -- Распознанные поля
    detected_deal       VARCHAR(10),
    detected_category   VARCHAR(50),
    detected_price      BIGINT,
    detected_area       NUMERIC(10,2),
    detected_address    TEXT,
    detected_district   VARCHAR(100),
    detected_phone      VARCHAR(30),
    confidence          NUMERIC(3,2),

    -- Статус: pending | approved_lead | approved_listing | rejected | duplicate
    status      VARCHAR(30) NOT NULL DEFAULT 'pending',
    route_to    VARCHAR(20),

    -- Результат после одобрения
    result_lead_id      INTEGER,
    result_listing_id   INTEGER,

    -- Модерация
    moderated_by    INTEGER,
    moderated_at    TIMESTAMPTZ,
    reject_reason   TEXT,

    -- Дедупликация
    content_hash    VARCHAR(64),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (platform, post_id)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status
    ON t_p71821556_real_estate_catalog_.social_posts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_platform
    ON t_p71821556_real_estate_catalog_.social_posts (platform, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_criteria
    ON t_p71821556_real_estate_catalog_.social_posts (criteria_id, status);
