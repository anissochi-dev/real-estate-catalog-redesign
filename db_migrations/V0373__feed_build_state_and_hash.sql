ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE t_p71821556_real_estate_catalog_.xml_feeds ADD COLUMN IF NOT EXISTS content_uploaded_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.feed_build_state (
    name VARCHAR(50) PRIMARY KEY,
    force_before TIMESTAMP,
    last_feed_id INTEGER,
    last_run_at TIMESTAMPTZ,
    last_run_ms INTEGER,
    last_built INTEGER,
    last_uploaded INTEGER,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO t_p71821556_real_estate_catalog_.feed_build_state (name) VALUES ('main') ON CONFLICT (name) DO NOTHING;

INSERT INTO t_p71821556_real_estate_catalog_.cron_locks (name) VALUES ('xml-feeds-build') ON CONFLICT (name) DO NOTHING;
INSERT INTO t_p71821556_real_estate_catalog_.cron_locks (name) VALUES ('platform-sync-cron') ON CONFLICT (name) DO NOTHING;