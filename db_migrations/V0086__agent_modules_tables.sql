-- Таблица задач Диспетчера (Orchestrator)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.agent_tasks (
    id          SERIAL PRIMARY KEY,
    module      VARCHAR(50)  NOT NULL,          -- guardian | inspector | copywriter | dispatcher
    action      VARCHAR(100) NOT NULL,           -- конкретное действие модуля
    status      VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | running | done | failed
    params      JSONB        NOT NULL DEFAULT '{}',
    result      JSONB,
    error       TEXT,
    created_by  INT          REFERENCES t_p71821556_real_estate_catalog_.users(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    schedule    VARCHAR(50)  -- cron-выражение для авто-запуска (NULL = разово)
);

-- Конфиг модулей — включён ли модуль, настройки
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.agent_modules (
    id          SERIAL PRIMARY KEY,
    module      VARCHAR(50)  NOT NULL UNIQUE,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    config      JSONB        NOT NULL DEFAULT '{}',
    last_run_at TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Начальные записи модулей
INSERT INTO t_p71821556_real_estate_catalog_.agent_modules (module, enabled, config) VALUES
    ('guardian',   TRUE, '{"auto_block": true, "alert_email": true, "brute_threshold": 5, "spam_threshold": 3}'),
    ('inspector',  TRUE, '{"check_seo": true, "check_typos": true, "check_data": true, "max_items": 50}'),
    ('copywriter', TRUE, '{"tov": "профессиональный брокер коммерческой недвижимости", "max_articles_per_run": 3}'),
    ('dispatcher', TRUE, '{"auto_schedule": true, "guardian_interval_h": 6, "inspector_interval_h": 24, "copywriter_interval_h": 72}')
ON CONFLICT (module) DO NOTHING;

-- Блокировки IP/телефонов от Стража
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.agent_blocks (
    id          SERIAL PRIMARY KEY,
    block_type  VARCHAR(20)  NOT NULL, -- phone | ip | email
    value       VARCHAR(255) NOT NULL,
    reason      TEXT,
    blocked_by  VARCHAR(50)  NOT NULL DEFAULT 'guardian',
    blocked_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE(block_type, value)
);

-- Отчёты Инспектора
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.agent_reports (
    id          SERIAL PRIMARY KEY,
    module      VARCHAR(50)  NOT NULL,
    report_type VARCHAR(100) NOT NULL,
    summary     TEXT,
    data        JSONB        NOT NULL DEFAULT '{}',
    severity    VARCHAR(20)  DEFAULT 'info', -- info | warning | critical
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    is_resolved BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_module_status
    ON t_p71821556_real_estate_catalog_.agent_tasks(module, status);
CREATE INDEX IF NOT EXISTS idx_agent_blocks_active
    ON t_p71821556_real_estate_catalog_.agent_blocks(block_type, is_active);
CREATE INDEX IF NOT EXISTS idx_agent_reports_module
    ON t_p71821556_real_estate_catalog_.agent_reports(module, created_at DESC);
