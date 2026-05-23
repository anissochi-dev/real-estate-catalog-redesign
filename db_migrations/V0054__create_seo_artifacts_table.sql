CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.seo_artifacts (
  id SERIAL PRIMARY KEY,
  kind TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  urls_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
