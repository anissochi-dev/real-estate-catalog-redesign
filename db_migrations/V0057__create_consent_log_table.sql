CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.consent_log (
  id BIGSERIAL PRIMARY KEY,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  documents_opened JSONB DEFAULT '[]'::jsonb,
  page_url TEXT,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_consent_log_accepted_at
  ON t_p71821556_real_estate_catalog_.consent_log (accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_log_ip
  ON t_p71821556_real_estate_catalog_.consent_log (ip_address);

CREATE INDEX IF NOT EXISTS idx_consent_log_session
  ON t_p71821556_real_estate_catalog_.consent_log (session_id);
