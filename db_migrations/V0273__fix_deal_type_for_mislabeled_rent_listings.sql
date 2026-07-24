UPDATE t_p71821556_real_estate_catalog_.listings
SET deal = 'rent', updated_at = NOW()
WHERE id IN (158, 164, 166, 169, 170, 175) AND deal = 'sale';