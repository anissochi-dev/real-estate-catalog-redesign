-- Хранилище переписки с покупателями по объявлениям Юлы (входящие через вебхук + исходящие через /messages)
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.youla_messages (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(50) NULL,
    product_id VARCHAR(50) NULL,
    listing_id INTEGER NULL,
    sender_id VARCHAR(50) NULL,
    recipient_id VARCHAR(50) NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'in',
    message TEXT NULL,
    images JSONB NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_youla_messages_chat ON t_p71821556_real_estate_catalog_.youla_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_youla_messages_listing ON t_p71821556_real_estate_catalog_.youla_messages(listing_id);
COMMENT ON TABLE t_p71821556_real_estate_catalog_.youla_messages IS
    'Переписка с покупателями по объявлениям Юлы: message.incom вебхук + ответы через /messages';