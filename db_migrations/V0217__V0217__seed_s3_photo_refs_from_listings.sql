INSERT INTO t_p71821556_real_estate_catalog_.s3_photo_refs (s3_key, cdn_url, uploaded_at, listing_id, attached_at, is_orphan)
SELECT DISTINCT
    substr(url, length('https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/bucket/') + 1) as s3_key,
    url as cdn_url,
    COALESCE(l.created_at, NOW()) as uploaded_at,
    l.id as listing_id,
    COALESCE(l.updated_at, l.created_at, NOW()) as attached_at,
    FALSE as is_orphan
FROM (
    SELECT
        id,
        created_at,
        updated_at,
        unnest(string_to_array(
            COALESCE(images, '') || '|' || COALESCE(image, ''),
            '|'
        )) as url
    FROM t_p71821556_real_estate_catalog_.listings
) l
WHERE url LIKE 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/bucket/photos/%'
  AND url != ''
ON CONFLICT (s3_key) DO NOTHING;
