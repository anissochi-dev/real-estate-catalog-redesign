CREATE TABLE t_p71821556_real_estate_catalog_.s3_orphans_log (
    id              SERIAL PRIMARY KEY,
    run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_s3        INT NOT NULL DEFAULT 0,
    used_s3         INT NOT NULL DEFAULT 0,
    orphan_s3       INT NOT NULL DEFAULT 0,
    removed_s3      INT NOT NULL DEFAULT 0,
    total_size_mb   NUMERIC(10,2) DEFAULT 0,
    orphan_size_mb  NUMERIC(10,2) DEFAULT 0,
    removed_size_mb NUMERIC(10,2) DEFAULT 0,
    orphan_keys     TEXT,
    removed_keys    TEXT,
    status          VARCHAR(20) DEFAULT 'completed',
    error_msg       TEXT
);
CREATE INDEX idx_s3_orphans_log_run_at ON t_p71821556_real_estate_catalog_.s3_orphans_log(run_at DESC);
