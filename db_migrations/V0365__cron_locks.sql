CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.cron_locks (
    name VARCHAR(100) PRIMARY KEY,
    locked_until TIMESTAMPTZ,
    locked_by VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO t_p71821556_real_estate_catalog_.cron_locks (name) VALUES ('xml-feeds-cron') ON CONFLICT (name) DO NOTHING;