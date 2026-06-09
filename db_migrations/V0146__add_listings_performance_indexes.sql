CREATE INDEX IF NOT EXISTS idx_listing_stats_listing_event
    ON t_p71821556_real_estate_catalog_.listing_stats (listing_id, event_type);

CREATE INDEX IF NOT EXISTS idx_leads_listing_id
    ON t_p71821556_real_estate_catalog_.leads (listing_id)
    WHERE listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_created_at
    ON t_p71821556_real_estate_catalog_.listings (created_at DESC);
