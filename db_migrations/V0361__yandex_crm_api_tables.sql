-- Переход API Яндекс.Недвижимости с публичного Партнёрского API кампаний
-- (Директ, требовал недоступный доступ OnCustomer) на официальный CRM API
-- (https://api.realty.yandex.net/2.0/crm) — статистика фида и объявлений
-- по OAuth-токену без привязки к рекламному кабинету.

-- Дневная статистика по каждому объекту (показы в листинге, показы карточки,
-- показы телефона, звонки) — заменяет прежнюю yandex_calls (только звонки).
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.yandex_offer_stats (
    id BIGSERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL,
    yandex_offer_id VARCHAR(50) NOT NULL,
    stat_date DATE NOT NULL,
    shows INTEGER DEFAULT 0,
    card_shows INTEGER DEFAULT 0,
    phone_shows INTEGER DEFAULT 0,
    calls INTEGER DEFAULT 0,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (yandex_offer_id, stat_date)
);
CREATE INDEX IF NOT EXISTS idx_yandex_offer_stats_listing ON t_p71821556_real_estate_catalog_.yandex_offer_stats(listing_id);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.yandex_offer_stats IS
    'Дневная статистика объявлений из CRM API Яндекс.Недвижимости (GET /crm/offer/{offerId}/stats): показы в листинге, показы карточки, показы телефона, звонки';

-- Текущее состояние каждого объявления на стороне Яндекса (id, статус индексации,
-- ошибки) — из GET /crm/offers. Обновляется полностью при каждой синхронизации.
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.yandex_offer_status (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL UNIQUE,
    yandex_offer_id VARCHAR(50) NOT NULL,
    yandex_url TEXT NULL,
    create_time TIMESTAMP WITH TIME ZONE NULL,
    error_type VARCHAR(100) NULL,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.yandex_offer_status IS
    'Статус каждого объявления на Яндекс.Недвижимости (аналог youla_item_status) — из CRM API GET /crm/offers';

-- Лог синхронизации — расширяем под новую модель: id фида на стороне Яндекса,
-- итог индексации (total/accepted/declined) вместо старого calls_count.
ALTER TABLE t_p71821556_real_estate_catalog_.yandex_sync_log
    ADD COLUMN IF NOT EXISTS yandex_feed_id VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS offers_total INTEGER NULL,
    ADD COLUMN IF NOT EXISTS offers_accepted INTEGER NULL,
    ADD COLUMN IF NOT EXISTS offers_declined INTEGER NULL;
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.yandex_sync_log.yandex_feed_id IS
    'ID фида на стороне Яндекса (GET /crm/feeds, найден по совпадению URL с нашим yandex.xml)';
