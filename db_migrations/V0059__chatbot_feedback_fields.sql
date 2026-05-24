ALTER TABLE t_p71821556_real_estate_catalog_.chatbot_log
  ADD COLUMN IF NOT EXISTS feedback SMALLINT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chatbot_log_session
  ON t_p71821556_real_estate_catalog_.chatbot_log (session_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_log_feedback
  ON t_p71821556_real_estate_catalog_.chatbot_log (feedback)
  WHERE feedback IS NOT NULL;
