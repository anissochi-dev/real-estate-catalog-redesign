CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.market_listings (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    external_id VARCHAR(200),
    url TEXT,
    title TEXT,
    category VARCHAR(100),
    deal_type VARCHAR(20),
    price BIGINT,
    price_per_m2 NUMERIC(12,2),
    area NUMERIC(10,2),
    address TEXT,
    district VARCHAR(200),
    floor INTEGER,
    total_floors INTEGER,
    condition VARCHAR(100),
    description TEXT,
    phone VARCHAR(50),
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_market_listings_source ON t_p71821556_real_estate_catalog_.market_listings(source);
CREATE INDEX IF NOT EXISTS idx_market_listings_category ON t_p71821556_real_estate_catalog_.market_listings(category);
CREATE INDEX IF NOT EXISTS idx_market_listings_deal_type ON t_p71821556_real_estate_catalog_.market_listings(deal_type);
CREATE INDEX IF NOT EXISTS idx_market_listings_scraped_at ON t_p71821556_real_estate_catalog_.market_listings(scraped_at);
