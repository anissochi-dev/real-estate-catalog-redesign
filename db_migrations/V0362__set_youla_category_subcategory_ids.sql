UPDATE t_p71821556_real_estate_catalog_.ad_platform_keys
SET extra = extra || '{"category_id": "20", "subcategory_id": "2013"}'::jsonb,
    updated_at = NOW()
WHERE platform = 'youla';