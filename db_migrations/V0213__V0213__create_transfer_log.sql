-- V0213: Лог передачи объектов/заявок между пользователями при удалении
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.transfer_log (
  id               SERIAL PRIMARY KEY,
  from_user_id     INTEGER,
  from_user_name   VARCHAR(150),
  to_user_id       INTEGER NOT NULL,
  to_user_name     VARCHAR(150),
  transferred_by   INTEGER,
  listings_count   INTEGER DEFAULT 0,
  leads_count      INTEGER DEFAULT 0,
  note             TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_log_from_user
  ON t_p71821556_real_estate_catalog_.transfer_log(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_log_to_user
  ON t_p71821556_real_estate_catalog_.transfer_log(to_user_id);
