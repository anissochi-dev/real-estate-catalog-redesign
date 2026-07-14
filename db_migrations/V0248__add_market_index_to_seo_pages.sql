INSERT INTO t_p71821556_real_estate_catalog_.seo_pages
  (path, title, description, h1, keywords, noindex, page_label, auto_generated, manual_override)
VALUES
  ('/market-index',
   'Цены на коммерческую недвижимость в Краснодаре — аренда и продажа | Индекс цен',
   'Актуальные медианные цены за м² на офисы, торговые помещения, склады и другую коммерческую недвижимость в Краснодаре. Динамика цен по районам, обновление ежедневно.',
   'Индекс цен коммерческой недвижимости Краснодара',
   'цены на коммерческую недвижимость Краснодар, стоимость аренды офиса, цена м² склад, аналитика рынка недвижимости',
   FALSE,
   'Индекс цен',
   FALSE,
   TRUE)
ON CONFLICT DO NOTHING;

UPDATE t_p71821556_real_estate_catalog_.seo_artifacts SET urls_count = 0 WHERE kind = 'sitemap';