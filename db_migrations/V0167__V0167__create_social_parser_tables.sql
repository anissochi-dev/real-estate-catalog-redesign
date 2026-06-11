-- social_sessions: хранение cookies/сессий для парсеров VK, OK
-- social_parser_log: история запусков и найденных объявлений
-- social_parser_sources: настройки источников (группы, каналы)

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.social_sessions (
    id              SERIAL PRIMARY KEY,
    platform        VARCHAR(20) NOT NULL,           -- vk, ok, telegram
    label           VARCHAR(100) NOT NULL DEFAULT '', -- название для UI
    cookies         TEXT,                            -- JSON строка с куки
    session_string  TEXT,                            -- MTProto строка (Telegram)
    phone           VARCHAR(30),                     -- номер телефона (Telegram)
    requests_today  INTEGER NOT NULL DEFAULT 0,
    requests_hour   INTEGER NOT NULL DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    last_reset_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_until   TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform, label)
);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.social_parser_sources (
    id          SERIAL PRIMARY KEY,
    platform    VARCHAR(20) NOT NULL,               -- vk, ok, telegram
    source_id   VARCHAR(200) NOT NULL,              -- group_id / channel_slug
    source_url  VARCHAR(500),                        -- полный URL группы/канала
    title       VARCHAR(200),                        -- название для UI
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    last_parsed_at TIMESTAMPTZ,
    posts_found    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (platform, source_id)
);

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.social_parser_log (
    id           SERIAL PRIMARY KEY,
    platform     VARCHAR(20) NOT NULL,
    source_id    VARCHAR(200),
    status       VARCHAR(20) NOT NULL DEFAULT 'running', -- running, done, error
    posts_found  INTEGER NOT NULL DEFAULT 0,
    posts_saved  INTEGER NOT NULL DEFAULT 0,
    error_msg    TEXT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_social_sessions_platform
    ON t_p71821556_real_estate_catalog_.social_sessions (platform, is_active);

CREATE INDEX IF NOT EXISTS idx_social_parser_sources_platform
    ON t_p71821556_real_estate_catalog_.social_parser_sources (platform, is_active);

CREATE INDEX IF NOT EXISTS idx_social_parser_log_started
    ON t_p71821556_real_estate_catalog_.social_parser_log (started_at DESC);
