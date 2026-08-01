UPDATE t_p71821556_real_estate_catalog_.infrastructure
SET name = CASE infra_type
    WHEN 'tram_stop' THEN 'Трамвайная остановка'
    WHEN 'bus_stop' THEN 'Автобусная остановка'
    WHEN 'subway_entrance' THEN 'Метро / электрозаправка'
    WHEN 'railway_station' THEN 'ЖД-вокзал / платформа'
    WHEN 'shopping_mall' THEN 'Торговый центр'
    WHEN 'supermarket' THEN 'Супермаркет'
    WHEN 'market' THEN 'Рынок'
    WHEN 'business_center' THEN 'Бизнес-центр'
    WHEN 'park' THEN 'Парк / сквер'
    WHEN 'school' THEN 'Школа'
    WHEN 'hospital' THEN 'Больница / клиника'
    ELSE name
END
WHERE name = infra_type;