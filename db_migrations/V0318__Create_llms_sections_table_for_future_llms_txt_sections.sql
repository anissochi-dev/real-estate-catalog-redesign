CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.llms_sections (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE t_p71821556_real_estate_catalog_.llms_sections IS
    'Задел под будущие разделы сайта (услуги и т.п.), которых ещё нет в основных таблицах.
     Попадают в раздел "Другое" файла llms.txt. Записи добавляются вручную по мере появления
     новых разделов на сайте.';
