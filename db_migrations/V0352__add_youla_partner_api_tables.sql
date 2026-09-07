-- Youla Partner API: таблицы для синхронизации объявлений (аналогично Avito)

ALTER TABLE t_p71821556_real_estate_catalog_.listings
    ADD COLUMN IF NOT EXISTS youla_ad_id VARCHAR(50) NULL;
COMMENT ON COLUMN t_p71821556_real_estate_catalog_.listings.youla_ad_id IS
    'ID объявления (продукта) на Юле, полученный через Partner API (POST /products)';

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.youla_sync_log (
    id SERIAL PRIMARY KEY,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_id TEXT NULL,
    owner_name TEXT NULL,
    error TEXT NULL,
    raw_response JSONB NULL
);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.youla_sync_log IS
    'Лог проверки подключения к Youla Partner API (аналог avito_sync_log)';

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.youla_item_status (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER NOT NULL UNIQUE,
    youla_id VARCHAR(50) NULL,
    url TEXT NULL,
    is_published BOOLEAN NULL,
    is_archived BOOLEAN NULL,
    is_blocked BOOLEAN NULL,
    block_type_text TEXT NULL,
    views INTEGER NULL,
    shows INTEGER NULL,
    contacts INTEGER NULL,
    unique_contacts INTEGER NULL,
    error TEXT NULL,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.youla_item_status IS
    'Статус и статистика каждого объявления на Юле (аналог avito_item_status)';