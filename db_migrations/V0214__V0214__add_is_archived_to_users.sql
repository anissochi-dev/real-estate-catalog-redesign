-- V0214: Архивирование пользователей
ALTER TABLE t_p71821556_real_estate_catalog_.users
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_is_archived
  ON t_p71821556_real_estate_catalog_.users(is_archived);
