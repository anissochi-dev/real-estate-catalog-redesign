-- Асинхронные джобы генерации статей новостей. Нужны из-за жёсткого лимита выполнения
-- Cloud Function (~30 сек): генерация статьи в 3000 слов у YandexGPT занимает дольше —
-- поэтому запуск и опрос готовности разнесены на несколько коротких HTTP-вызовов подряд
-- (тот же паттерн, что уже используется в этом проекте для генерации обложек YandexART).
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.news_gen_jobs (
    id SERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, polling, checking_unique, done, error
    topic VARCHAR(300),
    snippets JSONB DEFAULT '[]'::jsonb,
    key_rate NUMERIC(5,2),
    operation_id VARCHAR(200),
    article JSONB,
    error TEXT,
    news_id INTEGER,
    slug VARCHAR(320),
    auto_publish BOOLEAN NOT NULL DEFAULT FALSE,
    is_auto BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_gen_jobs_status ON t_p71821556_real_estate_catalog_.news_gen_jobs (status);
