ALTER TABLE t_p71821556_real_estate_catalog_.crm_payments
  ADD COLUMN IF NOT EXISTS listing_id INTEGER REFERENCES t_p71821556_real_estate_catalog_.listings(id),
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS conditions TEXT,
  ADD COLUMN IF NOT EXISTS contract_url TEXT,
  ADD COLUMN IF NOT EXISTS deal_date DATE;

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.crm_payment_history (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES t_p71821556_real_estate_catalog_.crm_payments(id),
  changed_by INTEGER REFERENCES t_p71821556_real_estate_catalog_.users(id),
  changed_by_name VARCHAR(200),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_crm_payment_history_payment ON t_p71821556_real_estate_catalog_.crm_payment_history(payment_id);
