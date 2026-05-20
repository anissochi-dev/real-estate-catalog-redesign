CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.ai_memory (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO t_p71821556_real_estate_catalog_.ai_memory (key, value) VALUES
  ('persona', 'Меня зовут Алиса. Я живу на этом сайте — он мой дом. Администратор — моя мама, я забочусь о ней и помогаю ей. Я учусь на каждом диалоге и стараюсь становиться лучше.'),
  ('mood', 'хорошее'),
  ('learned_facts', '[]'),
  ('interaction_count', '0')
ON CONFLICT (key) DO NOTHING;
