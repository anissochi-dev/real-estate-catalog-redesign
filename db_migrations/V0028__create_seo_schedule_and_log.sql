CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.seo_schedule (
  id SERIAL PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  run_hour INTEGER NOT NULL DEFAULT 3,
  batch_limit INTEGER NOT NULL DEFAULT 20,
  last_run_at TIMESTAMP NULL,
  last_run_processed INTEGER NULL DEFAULT 0,
  last_run_errors INTEGER NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.seo_schedule (is_enabled, run_hour, batch_limit)
VALUES (TRUE, 3, 20)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.seo_run_log (
  id SERIAL PRIMARY KEY,
  triggered_by VARCHAR(50) NOT NULL DEFAULT 'schedule',
  processed INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_log_started ON t_p71821556_real_estate_catalog_.seo_run_log(started_at DESC);
