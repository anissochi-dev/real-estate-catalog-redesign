-- DomClick Stats API: таблицы для синхронизации статистики объявлений
-- (аналогично youla_sync_log/youla_item_status — только статистика, без публикации через API)

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.domclick_sync_log (
    id SERIAL PRIMARY KEY,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    offers_count INTEGER NULL,
    error TEXT NULL
);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.domclick_sync_log IS
    'Лог синхронизации с DomClick Stats API (аналог youla_sync_log)';

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.domclick_item_status (
    id SERIAL PRIMARY KEY,
    offer_id BIGINT NOT NULL UNIQUE,
    feed_offer_id VARCHAR(50) NULL,
    listing_id INTEGER NULL,
    status VARCHAR(100) NULL,
    source VARCHAR(20) NULL,
    domclick_link TEXT NULL,
    offer_type VARCHAR(100) NULL,
    deal_type VARCHAR(50) NULL,
    is_duplicate BOOLEAN NULL,
    moderation_reason TEXT NULL,
    moderation_comment TEXT NULL,
    published_dt TIMESTAMP WITH TIME ZONE NULL,
    publish_end_dt TIMESTAMP WITH TIME ZONE NULL,
    views INTEGER NULL,
    phone_shows INTEGER NULL,
    search_shows INTEGER NULL,
    chats_total INTEGER NULL,
    chats_answered INTEGER NULL,
    chats_unanswered INTEGER NULL,
    favorites INTEGER NULL,
    errors TEXT NULL,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.domclick_item_status IS
    'Статус и статистика каждого объявления в DomClick (аналог youla_item_status). listing_id сопоставляется по feed_offer_id = internal-id из нашего XML-фида (обычно совпадает с ID объекта на сайте)';
CREATE INDEX IF NOT EXISTS idx_domclick_item_status_listing_id ON t_p71821556_real_estate_catalog_.domclick_item_status(listing_id);
