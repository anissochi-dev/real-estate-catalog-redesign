-- Хранит id активного (не завершённого) джоба генерации статьи, чтобы каждый следующий
-- вызов крона просто продолжал его, а не создавал новый.
ALTER TABLE t_p71821556_real_estate_catalog_.news_schedule
  ADD COLUMN IF NOT EXISTS active_job_id INTEGER;
