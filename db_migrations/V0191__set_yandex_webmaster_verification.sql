UPDATE t_p71821556_real_estate_catalog_.settings
SET yandex_webmaster_verification = '7099028f3e2220eb'
WHERE id = (SELECT id FROM t_p71821556_real_estate_catalog_.settings ORDER BY id ASC LIMIT 1);