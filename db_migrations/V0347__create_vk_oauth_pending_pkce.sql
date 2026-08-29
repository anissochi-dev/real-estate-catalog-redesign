CREATE TABLE vk_oauth_pending (
    state VARCHAR(64) PRIMARY KEY,
    code_verifier VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
