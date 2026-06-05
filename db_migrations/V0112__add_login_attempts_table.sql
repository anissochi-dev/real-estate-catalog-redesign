-- Таблица для rate-limiting и brute-force защиты
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.login_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    email VARCHAR(150),
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
    ON t_p71821556_real_estate_catalog_.login_attempts (ip, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
    ON t_p71821556_real_estate_catalog_.login_attempts (email, attempted_at DESC);
