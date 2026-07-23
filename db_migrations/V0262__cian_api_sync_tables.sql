-- Таблицы для кэширования данных Циан API (аналог vk_ads_*)

-- Объявления Циан (список из get-my-offers + детали из get-my-offers-detail)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_offers (
    id BIGINT PRIMARY KEY,                  -- ID объявления в Циан
    external_id BIGINT,                     -- ID нашего объекта (ExternalId из XML фида = listings.id)
    status TEXT,                            -- published | inactive | refusedByModerator | removedByModerator
    source TEXT,                            -- manual | upload
    url TEXT,
    creation_date TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cian_offers_external_id ON t_p71821556_real_estate_catalog_.cian_offers(external_id);

-- Статистика по объявлениям за всё время (просмотры, звонки, избранное и т.д.)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_offer_stats (
    offer_id BIGINT PRIMARY KEY,
    add_to_favorites BIGINT DEFAULT 0,
    calls BIGINT DEFAULT 0,
    chats BIGINT DEFAULT 0,
    phone_shows BIGINT DEFAULT 0,
    phone_views BIGINT DEFAULT 0,
    phone_views_and_chats BIGINT DEFAULT 0,
    responses BIGINT DEFAULT 0,
    shows_base BIGINT DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Активные платные услуги по объявлению (выделение, топ-3, премиум и т.д.)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_offer_services (
    id SERIAL PRIMARY KEY,
    offer_id BIGINT NOT NULL,
    service_type TEXT NOT NULL,             -- Highlight, Top3, PremiumObject, calltracking, auction, ...
    price NUMERIC,
    paid_till TIMESTAMPTZ,
    auto_prolong BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (offer_id, service_type)
);
CREATE INDEX IF NOT EXISTS idx_cian_offer_services_offer_id ON t_p71821556_real_estate_catalog_.cian_offer_services(offer_id);

-- Звонки по объявлениям (номер звонящего, длительность, статус)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_calls (
    call_id BIGINT PRIMARY KEY,
    offer_id BIGINT,
    external_id BIGINT,
    source_phone TEXT,
    destination_phone TEXT,
    calltracking_phone TEXT,
    duration INT,
    status TEXT,
    call_datetime TIMESTAMPTZ,
    employee_id BIGINT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cian_calls_offer_id ON t_p71821556_real_estate_catalog_.cian_calls(offer_id);
CREATE INDEX IF NOT EXISTS idx_cian_calls_external_id ON t_p71821556_real_estate_catalog_.cian_calls(external_id);

-- Баланс аккаунта (одна текущая запись + история)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_balance (
    id SERIAL PRIMARY KEY,
    total_balance NUMERIC DEFAULT 0,
    bonuses_amount NUMERIC DEFAULT 0,
    auction_points_amount NUMERIC DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Лог синхронизации
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cian_sync_log (
    id SERIAL PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    offers_count INT DEFAULT 0,
    stats_count INT DEFAULT 0,
    services_count INT DEFAULT 0,
    calls_count INT DEFAULT 0,
    error TEXT
);
