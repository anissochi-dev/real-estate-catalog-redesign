-- VK Ads: рекламные планы (кампании)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vk_ads_plans (
    id BIGINT PRIMARY KEY,
    name TEXT,
    status TEXT,
    budget_limit NUMERIC,
    budget_limit_day NUMERIC,
    date_start TEXT,
    date_end TEXT,
    objective TEXT,
    delivery TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- VK Ads: рекламные группы
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vk_ads_groups (
    id BIGINT PRIMARY KEY,
    ad_plan_id BIGINT,
    name TEXT,
    status TEXT,
    budget_limit NUMERIC,
    budget_limit_day NUMERIC,
    delivery TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- VK Ads: объявления
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vk_ads_items (
    id BIGINT PRIMARY KEY,
    ad_group_id BIGINT,
    name TEXT,
    status TEXT,
    delivery TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- VK Ads: ежедневная статистика по планам
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vk_ads_stats (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,   -- 'plan' | 'group'
    entity_id BIGINT NOT NULL,
    stat_date DATE NOT NULL,
    shows BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    spent NUMERIC DEFAULT 0,
    ctr NUMERIC DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_type, entity_id, stat_date)
);

-- VK Ads: метка последней синхронизации
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vk_ads_sync_log (
    id SERIAL PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    plans_count INT DEFAULT 0,
    groups_count INT DEFAULT 0,
    ads_count INT DEFAULT 0,
    stats_rows INT DEFAULT 0,
    error TEXT
);