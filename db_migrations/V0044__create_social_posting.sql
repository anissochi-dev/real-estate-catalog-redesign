CREATE TABLE t_p71821556_real_estate_catalog_.social_posting_settings (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    access_token TEXT,
    token_extra TEXT,
    auto_on_listing BOOLEAN NOT NULL DEFAULT FALSE,
    auto_on_lead BOOLEAN NOT NULL DEFAULT FALSE,
    post_template TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.social_posting_settings (platform, is_enabled, post_template) VALUES
('vk',        FALSE, 'Новый объект: {title}\n{price} ₽ · {area} м²\n{address}\n\n{description}\n\nПодробнее: {url}'),
('telegram',  FALSE, '*{title}*\n💰 {price} ₽ · 📐 {area} м²\n📍 {address}\n\n{description}\n\n🔗 {url}'),
('pinterest',  FALSE, '{title} | {price} ₽ | {address}'),
('linkedin',  FALSE, '{title}\n{price} ₽ · {area} м²\n{address}\n\n{description}\n\n{url}'),
('yandex_zen', FALSE, '{title}\n{description}\n\nСсылка: {url}'),
('tenchat',   FALSE, '{title}\n{price} ₽ · {area} м²\n{address}\n\n{description}\n\n{url}'),
('mak',       FALSE, '{title}\n{price} ₽ · {area} м²\n{address}\n\n{description}\n\n{url}'),
('dvizhenie', FALSE, '{title}\n{price} ₽ · {area} м²\n{address}\n\n{description}\n\n{url}');

CREATE TABLE t_p71821556_real_estate_catalog_.social_post_log (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    post_text TEXT,
    post_id VARCHAR(200),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_post_log_entity ON t_p71821556_real_estate_catalog_.social_post_log(entity_type, entity_id);
