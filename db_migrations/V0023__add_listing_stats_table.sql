CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.listing_stats (
  id          BIGSERIAL PRIMARY KEY,
  listing_id  INTEGER NOT NULL,
  event_type  VARCHAR(50) NOT NULL,
  source      VARCHAR(50) NOT NULL DEFAULT 'site',
  count       INTEGER NOT NULL DEFAULT 1,
  note        TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  recorded_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_listing_stats_listing_id ON t_p71821556_real_estate_catalog_.listing_stats(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_stats_recorded_at ON t_p71821556_real_estate_catalog_.listing_stats(recorded_at DESC);

ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS views_site INTEGER NOT NULL DEFAULT 0;
