ALTER TABLE t_p71821556_real_estate_catalog_.districts ADD COLUMN IF NOT EXISTS is_okrug BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE t_p71821556_real_estate_catalog_.districts SET is_okrug = TRUE WHERE id IN (85, 80, 77, 98);
