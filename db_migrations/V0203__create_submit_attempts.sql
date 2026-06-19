CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.submit_attempts (
  id           SERIAL PRIMARY KEY,
  ip           TEXT NOT NULL,
  phone_tail   TEXT NOT NULL,
  form_token   TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submit_ip    ON t_p71821556_real_estate_catalog_.submit_attempts(ip, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submit_phone ON t_p71821556_real_estate_catalog_.submit_attempts(phone_tail, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submit_token ON t_p71821556_real_estate_catalog_.submit_attempts(form_token);
