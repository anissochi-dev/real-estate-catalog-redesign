INSERT INTO t_p71821556_real_estate_catalog_.price_history
    (year, district_name, category, deal_type, avg_price_per_m2, avg_rent_per_m2_year, avg_cap_rate, vacancy_rate, source, notes)
VALUES
    (2021, 'Центральный округ', 'office',       'sale', 109984, NULL,  NULL, NULL, 'manual', 'Самый дорогой округ по офисам в 2021'),
    (2021, 'Карасунский округ', 'office',       'sale',  56452, NULL,  NULL, NULL, 'manual', 'Самый доступный округ по офисам в 2021'),
    (2021, 'Прикубанский округ','office',       'sale',  80000, NULL,  NULL, NULL, 'manual', 'Прикубанский +48% рост цен в 2021'),
    (2021, 'Западный округ',    'office',       'sale',  99000, NULL,  NULL, NULL, 'manual', 'Западный +18.5% рост цен в 2021'),
    (2021, 'Центральный округ', 'office',       'rent',  NULL,  9000,  NULL, NULL, 'manual', 'Аренда офисов центр 750 руб/м2/мес'),
    (2021, 'Прикубанский округ','office',       'rent',  NULL,  6000,  NULL, NULL, 'manual', 'Аренда офисов Прикубанский 500 руб/м2/мес'),
    (2021, 'Краснодар',         'warehouse',    'rent',  NULL,  4200,  NULL, NULL, 'manual', 'Аренда складов 350 руб/м2/мес, рост спроса +31% по РФ'),
    (2021, 'Краснодар',         'retail',       'rent',  NULL,  11280, NULL, NULL, 'manual', 'Аренда торговых 940 руб/м2/мес'),
    (2021, 'Краснодар',         'office',       'sale',  95315, NULL,  NULL, NULL, 'manual', 'Средняя цена офисно-торговая 95315 руб/м2'),

    (2022, 'Центральный округ', 'office',       'rent',  NULL,  12000, NULL, NULL, 'manual', 'Аренда офисов 750-1000 руб/м2/мес все округа'),
    (2022, 'Краснодар',         'office',       'sale',  89060, NULL,  NULL, NULL, 'manual', 'Торг-офисная 89060 руб/м2, рынок адаптировался к санкциям'),
    (2022, 'Краснодар',         'warehouse',    'rent',  NULL,  7380,  NULL, NULL, 'manual', 'Аренда складов класс А рост 6.5-12%'),
    (2022, 'Красная улица',     'retail',       'rent',  NULL,  NULL,  NULL, NULL, 'manual', 'Красная ул вошла в топ дорогих торговых улиц России'),

    (2023, 'Краснодар',         'catering',     'rent',  NULL,  10596, NULL, NULL, 'manual', 'Аренда общепит 833-938 руб/м2/мес, спрос +9.4%'),
    (2023, 'Краснодар',         'industrial',   'sale',  NULL,  NULL,  NULL, NULL, 'manual', 'Производство средняя цена лота 38.4 млн, дорогие в крае'),
    (2023, 'Краснодар',         'land',         'sale',  NULL,  NULL,  NULL, NULL, 'manual', 'Земля под коммерцию 2 079 337 руб/сотка'),

    (2024, 'Краснодар',         'office',       'sale', 112224, NULL,  NULL, NULL, 'manual', 'Офисно-торговая 112224 руб/м2, инвестиции в офисы x3.5 по РФ'),
    (2024, 'Краснодар',         'warehouse',    'rent',  NULL, 105000, NULL, NULL, 'manual', 'Склады класс А 9000-10000 руб/м2/год'),
    (2024, 'Краснодар',         'retail',       'both',  NULL,  NULL,   7.9, NULL, 'manual', 'Cap rate стрит-ритейл и супермаркеты 7.6-8.2%'),
    (2024, 'ЦМР',               'retail',       'sale', 350000, NULL,  NULL,  5.0, 'manual', 'Красная ул, центр 350-400 тыс/м2, вакансия ~5%'),
    (2024, 'Пашковский',        'free_purpose', 'sale',  56969, NULL,  NULL, 12.0, 'manual', 'Пашковский бюджетный сегмент 56969 руб/м2'),
    (2024, 'Краснодар',         'free_purpose', 'sale', 261923, NULL,  8.2,   9.0, 'manual', 'ПСН до 100 м2 востребованный сегмент малого бизнеса'),

    (2025, 'ЦМР',               'office',       'sale', 350000, NULL,  NULL, NULL, 'manual', 'Центр 350-400 тыс/м2'),
    (2025, 'Краснодар',         'office',       'sale', 152000, NULL,  NULL, NULL, 'manual', 'Средневзвешенная офисы 152 тыс/м2, снижение -2.5% с конца 2024'),
    (2025, 'Краснодар',         'retail',       'rent',  NULL,  30000, NULL, NULL, 'manual', 'Аренда коммерция 1700-3500 руб/м2/мес'),
    (2025, 'Спальные районы',   'office',       'sale', 180000, NULL,  NULL, NULL, 'manual', 'Спальные районы от 180 тыс/м2'),

    (2026, 'ЦМР',               'office',       'sale', 147849, NULL,  NULL, NULL, 'manual', 'Офисы класс А/В 147849 руб/м2 прогноз'),
    (2026, 'Краснодар',         'free_purpose', 'sale', 261923, NULL,  NULL, NULL, 'manual', 'ПСН до 100 м2 261923 руб/м2 прогноз'),
    (2026, 'Краснодар',         'warehouse',    'rent',  NULL, 112500, NULL, NULL, 'manual', 'Склады класс А 9500-10000 руб/м2/год прогноз'),
    (2026, 'Краснодар',         'retail',       'both',  NULL,  NULL,  NULL, NULL, 'manual', 'ГАБ остаётся популярной инвест-стратегией, рост цен +15-20%')
ON CONFLICT (year, district_name, category, deal_type) DO NOTHING;
