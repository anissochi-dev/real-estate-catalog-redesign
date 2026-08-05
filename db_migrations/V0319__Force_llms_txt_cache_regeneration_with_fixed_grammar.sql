UPDATE t_p71821556_real_estate_catalog_.seo_artifacts
SET updated_at = NOW() - INTERVAL '2 hours'
WHERE kind = 'llms_txt';