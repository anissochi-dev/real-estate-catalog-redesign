-- Кэш пересчитанной индексации (CAGR) по категориям и типам сделок,
-- считается ежедневно из price_market_snapshots (реальный ежедневный сбор цен).
CREATE TABLE t_p71821556_real_estate_catalog_.avg_indexation_cache (
  category VARCHAR(50) NOT NULL,
  deal VARCHAR(20) NOT NULL,
  avg_indexation_pct NUMERIC(5,2) NOT NULL,
  price_first NUMERIC(15,2),
  price_last NUMERIC(15,2),
  date_first DATE,
  date_last DATE,
  days_span INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (category, deal)
);

-- Настройки расписания ежедневного пересчёта индексации (01:30 по умолчанию)
ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS indexation_cron_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS indexation_cron_hour INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS indexation_cron_minute INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS indexation_cron_last_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS indexation_cron_last_status JSONB DEFAULT '{}'::jsonb;