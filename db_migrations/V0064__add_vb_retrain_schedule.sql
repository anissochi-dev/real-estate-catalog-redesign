ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS vb_retrain_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vb_retrain_hour integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS vb_retrain_sources jsonb NOT NULL DEFAULT '["news","listings","invest","demand","terms","market_prices"]'::jsonb,
  ADD COLUMN IF NOT EXISTS vb_retrain_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS vb_retrain_last_status text,
  ADD COLUMN IF NOT EXISTS vb_retrain_last_saved integer;