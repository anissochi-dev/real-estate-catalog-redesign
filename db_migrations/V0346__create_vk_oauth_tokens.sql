CREATE TABLE vk_oauth_tokens (
    id SERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    user_id BIGINT NULL,
    access_token TEXT NOT NULL,
    expires_at TIMESTAMP NULL,
    scope VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(group_id)
);
