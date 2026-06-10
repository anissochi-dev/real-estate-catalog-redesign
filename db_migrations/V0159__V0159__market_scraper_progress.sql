CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.market_scraper_progress (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL DEFAULT 'arrpro',
    category_slug VARCHAR(100) NOT NULL,
    deal_type VARCHAR(20) NOT NULL,
    last_page INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER,
    total_scraped INTEGER NOT NULL DEFAULT 0,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source, category_slug, deal_type)
);