UPDATE t_p71821556_real_estate_catalog_.social_posting_settings
SET platform = 'max',
    post_template = '🏢 {title}\n💰 {price} · 📐 {area}\n📍 {address}\n\n{description}\n\n🔗 {url}'
WHERE platform = 'mak';

UPDATE t_p71821556_real_estate_catalog_.social_posting_settings
SET is_enabled = TRUE;
