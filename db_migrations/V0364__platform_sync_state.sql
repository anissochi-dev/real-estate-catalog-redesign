CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.platform_sync_state (
    platform VARCHAR(50) PRIMARY KEY,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    consecutive_errors INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    paused_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);