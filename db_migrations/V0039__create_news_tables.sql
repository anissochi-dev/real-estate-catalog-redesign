CREATE TABLE t_p71821556_real_estate_catalog_.news (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    slug VARCHAR(320) UNIQUE,
    summary TEXT,
    content TEXT NOT NULL,
    image_url VARCHAR(500),
    source_url VARCHAR(500),
    source_name VARCHAR(200),
    category VARCHAR(50) DEFAULT 'market',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    is_auto BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER
);

CREATE INDEX idx_news_pub ON t_p71821556_real_estate_catalog_.news(is_published, published_at DESC);

CREATE TABLE t_p71821556_real_estate_catalog_.news_schedule (
    id SERIAL PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    run_hour INTEGER NOT NULL DEFAULT 9,
    articles_per_run INTEGER NOT NULL DEFAULT 3,
    last_run_at TIMESTAMPTZ,
    last_run_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
