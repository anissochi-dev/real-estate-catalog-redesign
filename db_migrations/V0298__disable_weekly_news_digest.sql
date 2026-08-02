-- Отключаем автопубликацию еженедельной сводки (статья на сайт + MAX-дайджест менеджерам)
-- по требованию пользователя. Механизм анализа цен остаётся в коде, но не запускается,
-- пока пользователь не включит переключатели обратно в админке.
UPDATE t_p71821556_real_estate_catalog_.news_schedule
SET price_news_enabled = FALSE,
    price_digest_max_enabled = FALSE
WHERE id = 1;

ALTER TABLE t_p71821556_real_estate_catalog_.news_schedule
  ALTER COLUMN price_news_enabled SET DEFAULT FALSE,
  ALTER COLUMN price_digest_max_enabled SET DEFAULT FALSE;
