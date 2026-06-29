CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.phone_flags (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    flag_type VARCHAR(20) NOT NULL CHECK (flag_type IN ('bad_owner', 'competitor')),
    comment TEXT,
    created_by INTEGER NOT NULL,
    created_by_name VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_flags_phone ON t_p71821556_real_estate_catalog_.phone_flags (phone);
CREATE INDEX IF NOT EXISTS idx_phone_flags_active ON t_p71821556_real_estate_catalog_.phone_flags (phone, is_active);