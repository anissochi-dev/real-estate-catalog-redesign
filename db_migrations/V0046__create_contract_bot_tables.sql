CREATE TABLE t_p71821556_real_estate_catalog_.contract_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES t_p71821556_real_estate_catalog_.users(id),
    title VARCHAR(255),
    contract_type VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    conditions_text TEXT,
    filled_contract TEXT,
    result_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p71821556_real_estate_catalog_.contract_documents (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES t_p71821556_real_estate_catalog_.contract_sessions(id),
    doc_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_ext VARCHAR(20),
    extracted_text TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contract_sessions_user ON t_p71821556_real_estate_catalog_.contract_sessions(user_id);
CREATE INDEX idx_contract_documents_session ON t_p71821556_real_estate_catalog_.contract_documents(session_id);
