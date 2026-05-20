CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.chatbot_log (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
