-- Стоп-слова для ВБ (слова/фразы которые ВБ не должен использовать)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vb_stop_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Источники для самообучения ВБ (URL сайтов)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.vb_learn_sources (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Темы для расписания автогенерации новостей
ALTER TABLE t_p71821556_real_estate_catalog_.news_schedule
    ADD COLUMN IF NOT EXISTS topics TEXT DEFAULT '';
