CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cron_runs (
  id SERIAL PRIMARY KEY,
  job VARCHAR(50) NOT NULL,
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(20) NULL
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_dispatched ON t_p71821556_real_estate_catalog_.cron_runs (dispatched_at);
UPDATE t_p71821556_real_estate_catalog_.cron_jobs SET interval_sec = 300 WHERE name = 'xml_feeds';