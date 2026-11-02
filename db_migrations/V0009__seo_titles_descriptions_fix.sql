UPDATE t_p71821556_real_estate_catalog_.seo_pages SET
  title = 'Цены на коммерческую недвижимость Краснодара за м² | БМН',
  updated_at = NOW()
WHERE path = '/market-index';

UPDATE t_p71821556_real_estate_catalog_.seo_pages SET
  title = 'Сетевые арендаторы ищут помещения в Краснодаре | БМН',
  description = 'Заявки федеральных и региональных сетей на аренду и покупку коммерческих помещений в Краснодаре: продукты, аптеки, банки, общепит. Предложите свой объект.',
  updated_at = NOW()
WHERE path = '/network-tenants';

UPDATE t_p71821556_real_estate_catalog_.seo_pages SET
  description = 'Новости и аналитика рынка коммерческой недвижимости Краснодара: цены аренды и продажи, новые объекты, тренды и комментарии экспертов БМН с 2007 года.',
  updated_at = NOW()
WHERE path = '/news';