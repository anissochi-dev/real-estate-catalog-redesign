CREATE TABLE t_p71821556_real_estate_catalog_.s3_photo_refs (
    id          SERIAL PRIMARY KEY,
    s3_key      VARCHAR(500) NOT NULL UNIQUE,
    cdn_url     VARCHAR(600) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    listing_id  INT REFERENCES t_p71821556_real_estate_catalog_.listings(id) ON UPDATE CASCADE,
    attached_at TIMESTAMPTZ,
    is_orphan   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_s3_photo_refs_listing ON t_p71821556_real_estate_catalog_.s3_photo_refs(listing_id);
CREATE INDEX idx_s3_photo_refs_orphan ON t_p71821556_real_estate_catalog_.s3_photo_refs(is_orphan, uploaded_at);
