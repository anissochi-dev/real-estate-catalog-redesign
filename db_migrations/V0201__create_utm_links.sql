CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.utm_links (
  id           SERIAL PRIMARY KEY,
  url          TEXT NOT NULL,
  base_url     TEXT NOT NULL,
  utm_source   TEXT NOT NULL DEFAULT '',
  utm_medium   TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content  TEXT NOT NULL DEFAULT '',
  utm_term     TEXT NOT NULL DEFAULT '',
  listing_id   INTEGER,
  label        TEXT,
  clicks       INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_utm_links_listing ON t_p71821556_real_estate_catalog_.utm_links(listing_id);
CREATE INDEX IF NOT EXISTS idx_utm_links_source  ON t_p71821556_real_estate_catalog_.utm_links(utm_source);
CREATE INDEX IF NOT EXISTS idx_utm_links_created ON t_p71821556_real_estate_catalog_.utm_links(created_at DESC);
