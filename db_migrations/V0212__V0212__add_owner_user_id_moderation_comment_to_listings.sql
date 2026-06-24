-- V0212: Привязка объекта к владельцу-клиенту + комментарий модерации
ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER,
  ADD COLUMN IF NOT EXISTS moderation_comment TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_owner_user_id
  ON t_p71821556_real_estate_catalog_.listings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_listings_status
  ON t_p71821556_real_estate_catalog_.listings(status);
