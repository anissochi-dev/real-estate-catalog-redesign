ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS export_domclick BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.export_requests (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES t_p71821556_real_estate_catalog_.listings(id),
  broker_id INTEGER NOT NULL REFERENCES t_p71821556_real_estate_catalog_.users(id),
  platforms TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  comment TEXT,
  reviewed_by INTEGER REFERENCES t_p71821556_real_estate_catalog_.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_requests_status ON t_p71821556_real_estate_catalog_.export_requests(status);
CREATE INDEX IF NOT EXISTS idx_export_requests_listing ON t_p71821556_real_estate_catalog_.export_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_export_requests_broker ON t_p71821556_real_estate_catalog_.export_requests(broker_id);
