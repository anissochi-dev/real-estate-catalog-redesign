CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.land_vri (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(60) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE t_p71821556_real_estate_catalog_.listings
  ADD COLUMN IF NOT EXISTS land_vri VARCHAR(150) NULL;

INSERT INTO t_p71821556_real_estate_catalog_.land_vri (slug, name, sort_order) VALUES
  ('izhs', 'Для индивидуального жилищного строительства (ИЖС)', 10),
  ('lph', 'Для ведения личного подсобного хозяйства (ЛПХ)', 20),
  ('gardening', 'Для садоводства', 30),
  ('kfh', 'Для крестьянского (фермерского) хозяйства', 40),
  ('commercial', 'Для коммерческого использования', 50),
  ('retail', 'Для размещения объектов торговли', 60),
  ('office', 'Для размещения офисов', 70),
  ('warehouse', 'Для складских помещений', 80),
  ('industrial', 'Для промышленного производства', 90),
  ('hospitality', 'Для гостиничного обслуживания', 100),
  ('public_catering', 'Для общественного питания', 110),
  ('agricultural', 'Для сельскохозяйственного использования', 120),
  ('recreation', 'Для отдыха и туризма', 130),
  ('transport', 'Для размещения объектов транспорта', 140)
ON CONFLICT (slug) DO NOTHING;