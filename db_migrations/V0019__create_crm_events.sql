CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.crm_events (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  event_type    VARCHAR(30) NOT NULL DEFAULT 'note',
  starts_at     TIMESTAMP NOT NULL,
  ends_at       TIMESTAMP,
  is_done       BOOLEAN NOT NULL DEFAULT FALSE,
  deal_id       INTEGER,
  owner_id      INTEGER,
  listing_id    INTEGER,
  created_by    INTEGER,
  assigned_to   INTEGER,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_events_starts_at ON t_p71821556_real_estate_catalog_.crm_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_crm_events_created_by ON t_p71821556_real_estate_catalog_.crm_events(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_events_deal_id ON t_p71821556_real_estate_catalog_.crm_events(deal_id);
