-- Автозапуск теперь всегда генерирует 1 глубокую статью (~3000 слов) вместо нескольких коротких.
UPDATE t_p71821556_real_estate_catalog_.news_schedule SET articles_per_run = 1 WHERE id = 1;
ALTER TABLE t_p71821556_real_estate_catalog_.news_schedule ALTER COLUMN articles_per_run SET DEFAULT 1;
