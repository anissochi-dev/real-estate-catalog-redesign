CREATE TABLE vk_market_items (
    id SERIAL PRIMARY KEY,
    feed_id INTEGER NOT NULL,
    listing_id INTEGER NOT NULL,
    vk_item_id BIGINT NULL,
    content_hash VARCHAR(64) NULL,
    sync_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT NULL,
    synced_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(feed_id, listing_id)
);

CREATE INDEX idx_vk_market_items_feed ON vk_market_items(feed_id);
CREATE INDEX idx_vk_market_items_listing ON vk_market_items(listing_id);

ALTER TABLE xml_feeds ADD COLUMN IF NOT EXISTS vk_api_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE xml_feeds ADD COLUMN IF NOT EXISTS vk_last_sync_at TIMESTAMP NULL;
ALTER TABLE xml_feeds ADD COLUMN IF NOT EXISTS vk_last_sync_result TEXT NULL;
