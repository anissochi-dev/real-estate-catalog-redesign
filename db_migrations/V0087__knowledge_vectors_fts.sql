-- База знаний ВБ с полнотекстовым поиском (PostgreSQL native)
-- pgvector будет добавлен когда платформа активирует расширение

CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.knowledge_vectors (
    id           SERIAL PRIMARY KEY,
    source_type  VARCHAR(50)  NOT NULL,  -- listing|news|ai_memory|article|manual|faq
    source_id    INT,
    title        VARCHAR(500),
    content      TEXT         NOT NULL,
    content_hash VARCHAR(64),            -- MD5 для дедупликации
    embedding    JSONB,                  -- float[] — готово к pgvector
    fts          TSVECTOR GENERATED ALWAYS AS (
                     to_tsvector('russian', coalesce(title,'') || ' ' || content)
                 ) STORED,
    meta         JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Полнотекстовый индекс GIN (быстрый поиск)
CREATE INDEX IF NOT EXISTS idx_knowledge_fts
    ON t_p71821556_real_estate_catalog_.knowledge_vectors USING gin(fts);

-- Индекс по источнику
CREATE INDEX IF NOT EXISTS idx_knowledge_source
    ON t_p71821556_real_estate_catalog_.knowledge_vectors (source_type, source_id);

-- Индекс по хешу (дедупликация)
CREATE INDEX IF NOT EXISTS idx_knowledge_hash
    ON t_p71821556_real_estate_catalog_.knowledge_vectors (content_hash)
    WHERE content_hash IS NOT NULL;

-- Индекс по дате (последние записи быстро)
CREATE INDEX IF NOT EXISTS idx_knowledge_created
    ON t_p71821556_real_estate_catalog_.knowledge_vectors (created_at DESC);
