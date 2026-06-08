-- Таблица инфраструктурных объектов Краснодара (OSM-данные)
-- Координаты хранятся как NUMERIC, расстояния считаем формулой Haversine в SQL/Python
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.infrastructure (
    id           SERIAL PRIMARY KEY,
    osm_id       BIGINT,
    infra_type   VARCHAR(50) NOT NULL,
    -- subway_entrance, tram_stop, bus_stop, shopping_mall, supermarket,
    -- business_center, park, school, hospital, market, railway_station
    name         VARCHAR(300),
    city         VARCHAR(100) DEFAULT 'Краснодар',
    lat          NUMERIC(10,7) NOT NULL,
    lng          NUMERIC(10,7) NOT NULL,
    meta         JSONB DEFAULT '{}',
    loaded_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_osm_type
    ON t_p71821556_real_estate_catalog_.infrastructure(osm_id, infra_type)
    WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_infra_type_city
    ON t_p71821556_real_estate_catalog_.infrastructure(infra_type, city);
CREATE INDEX IF NOT EXISTS idx_infra_lat_lng
    ON t_p71821556_real_estate_catalog_.infrastructure(lat, lng);

-- Кеш скоринга локации
CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.location_score_cache (
    listing_id       INTEGER PRIMARY KEY,
    score            NUMERIC(5,2) NOT NULL,
    score_breakdown  JSONB NOT NULL,
    infra_nearby     JSONB NOT NULL DEFAULT '{}',
    calculated_at    TIMESTAMPTZ DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_location_score_expires
    ON t_p71821556_real_estate_catalog_.location_score_cache(expires_at);
