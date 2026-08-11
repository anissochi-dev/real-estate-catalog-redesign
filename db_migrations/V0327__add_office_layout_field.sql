ALTER TABLE t_p71821556_real_estate_catalog_.listings ADD COLUMN IF NOT EXISTS office_layout VARCHAR(20) NULL;
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.office_layout IS 'Планировка офиса для Avito: cabinet (Кабинетная) / open (Открытая)';

UPDATE t_p71821556_real_estate_catalog_.listings SET office_layout = 'open' WHERE category = 'office' AND office_layout IS NULL;