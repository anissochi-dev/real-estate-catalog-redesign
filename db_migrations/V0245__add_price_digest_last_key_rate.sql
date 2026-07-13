ALTER TABLE t_p71821556_real_estate_catalog_.news_schedule
    ADD COLUMN IF NOT EXISTS price_digest_last_key_rate NUMERIC(5,2) NULL;

COMMENT ON COLUMN t_p71821556_real_estate_catalog_.news_schedule.price_digest_last_key_rate
    IS 'Ключевая ставка ЦБ РФ на момент прошлой еженедельной сводки — для честного сравнения "было/стало"';