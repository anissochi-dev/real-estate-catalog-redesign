-- П.8: версионирование фактов ai_memory
ALTER TABLE t_p71821556_real_estate_catalog_.ai_memory
  ADD COLUMN IF NOT EXISTS prev_value text NULL,
  ADD COLUMN IF NOT EXISTS updated_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source varchar(50) NULL;

-- П.7: таблица тест-вопросов для проверки ВБ после переобучения
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vb_test_questions (
  id serial PRIMARY KEY,
  question text NOT NULL,
  expected_keywords text[] NOT NULL DEFAULT '{}',
  category varchar(50) NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- П.7: таблица результатов тест-прогонов
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vb_test_runs (
  id serial PRIMARY KEY,
  triggered_by varchar(50) NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  total_questions integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  results jsonb NULL
);
