-- MAX Bot API: токен бота в settings
ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS notify_max_bot_token text NULL;

-- MAX user_id вместо max_phone (реальный идентификатор пользователя в MAX)
ALTER TABLE t_p71821556_real_estate_catalog_.users
  ADD COLUMN IF NOT EXISTS max_user_id varchar(64) NULL;
