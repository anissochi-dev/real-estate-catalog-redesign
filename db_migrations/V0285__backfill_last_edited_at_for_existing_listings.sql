UPDATE t_p71821556_real_estate_catalog_.listings
SET last_edited_at = COALESCE(updated_at, created_at),
    last_edited_by = COALESCE(last_edited_by, author_id)
WHERE last_edited_at IS NULL;