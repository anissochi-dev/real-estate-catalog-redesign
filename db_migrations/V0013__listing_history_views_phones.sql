-- История изменений объектов
CREATE TABLE IF NOT EXISTS listing_history (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  user_id INTEGER REFERENCES users(id),
  user_name VARCHAR(150),
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_history_listing ON listing_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_history_created ON listing_history(created_at DESC);

-- Статистика просмотров объектов
CREATE TABLE IF NOT EXISTS listing_views (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  ip VARCHAR(50),
  user_agent TEXT,
  referrer VARCHAR(500),
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_views_listing ON listing_views(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_views_date ON listing_views(viewed_at DESC);

-- Агрегированная статистика по дням
CREATE TABLE IF NOT EXISTS listing_stats_daily (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  stat_date DATE NOT NULL,
  views_count INTEGER DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  UNIQUE(listing_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_listing_stats_listing ON listing_stats_daily(listing_id);

-- Телефонная база
CREATE TABLE IF NOT EXISTS phone_contacts (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(30) NOT NULL,
  phone_normalized VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200),
  company VARCHAR(200),
  notes TEXT,
  tags TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_contacts_phone ON phone_contacts(phone_normalized);

-- Привязка телефона к объектам
CREATE TABLE IF NOT EXISTS phone_listing_links (
  id SERIAL PRIMARY KEY,
  phone_contact_id INTEGER NOT NULL REFERENCES phone_contacts(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  role VARCHAR(50) DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_contact_id, listing_id)
);

-- Привязка телефона к лидам
CREATE TABLE IF NOT EXISTS phone_lead_links (
  id SERIAL PRIMARY KEY,
  phone_contact_id INTEGER NOT NULL REFERENCES phone_contacts(id),
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone_contact_id, lead_id)
);
