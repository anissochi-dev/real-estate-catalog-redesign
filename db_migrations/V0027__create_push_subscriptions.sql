CREATE TABLE IF NOT EXISTS t_p71821556_real_estate_catalog_.push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON t_p71821556_real_estate_catalog_.push_subscriptions(user_id);
