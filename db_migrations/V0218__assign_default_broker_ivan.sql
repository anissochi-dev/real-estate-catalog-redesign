UPDATE t_p71821556_real_estate_catalog_.listings
SET broker_id = 1
WHERE broker_id IS NULL AND status = 'active';