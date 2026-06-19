-- Детализированные клики по UTM-ссылкам
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.utm_clicks (
  id          SERIAL PRIMARY KEY,
  link_id     INTEGER NOT NULL,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip          TEXT,
  user_agent  TEXT,
  referer     TEXT
);

CREATE INDEX IF NOT EXISTS idx_utm_clicks_link    ON t_p71821556_real_estate_catalog_.utm_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_utm_clicks_time    ON t_p71821556_real_estate_catalog_.utm_clicks(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_clicks_link_time ON t_p71821556_real_estate_catalog_.utm_clicks(link_id, clicked_at DESC);
