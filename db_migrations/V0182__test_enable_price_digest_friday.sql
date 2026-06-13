-- Тестовый запуск: включаем оповещения на сегодня (пятница = day 4)
UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET price_digest_enabled = TRUE,
    price_news_enabled = TRUE,
    price_digest_max_enabled = TRUE,
    price_digest_day = 4,
    price_digest_threshold = 3.0
WHERE id = 1;
