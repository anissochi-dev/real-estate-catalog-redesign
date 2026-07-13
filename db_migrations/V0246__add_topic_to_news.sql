ALTER TABLE t_p71821556_real_estate_catalog_.news
    ADD COLUMN IF NOT EXISTS topic VARCHAR(300) NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.news.topic
    IS 'Тема из AUTO_TOPICS (или кастомная), по которой была сгенерирована статья — используется для защиты от повторной генерации той же темы в ближайшие дни';

CREATE INDEX IF NOT EXISTS idx_news_topic_created
    ON t_p71821556_real_estate_catalog_.news (topic, created_at)
    WHERE topic IS NOT NULL;