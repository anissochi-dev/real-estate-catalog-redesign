CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.land_vri (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS land_vri VARCHAR(150) NULL;

INSERT INTO t_p71821556_real_estate_catalog_.land_vri (slug, name, sort_order) VALUES
  ('izhs', 'Под ИЖС (индивидуальное жилищное строительство)', 10),
  ('lph', 'Под ЛПХ (личное подсобное хозяйство)', 20),
  ('gardening', 'Садоводство', 30),
  ('kfh', 'Под КФХ (крестьянско-фермерское хозяйство)', 40),
  ('commercial', 'Под коммерческую застройку', 50),
  ('trade', 'Под объекты торговли', 60),
  ('industrial', 'Под производство', 70),
  ('warehouse', 'Под склады и логистику', 80),
  ('hospitality', 'Под гостиничное обслуживание', 90),
  ('multi', 'Под многоэтажную застройку', 100),
  ('agricultural', 'Сельскохозяйственное использование', 110),
  ('recreation', 'Под рекреацию и отдых', 120)
ON CONFLICT (slug) DO NOTHING;