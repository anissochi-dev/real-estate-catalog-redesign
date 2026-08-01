-- Лог синхронизации Авито (проверка токена + баланс кошелька, этап 1)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.avito_sync_log (
    id SERIAL PRIMARY KEY,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    account_id BIGINT,
    account_name TEXT,
    balance_real NUMERIC,
    balance_bonus NUMERIC,
    error TEXT
);