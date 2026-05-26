-- MAX-уведомления: настройки в settings
ALTER TABLE t_p71821556_real_estate_catalog_.settings
  ADD COLUMN IF NOT EXISTS notify_max_enabled         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_max_on_lead         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_max_on_deal         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_max_on_complaint    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_max_roles           text NULL DEFAULT 'broker,admin,director,office_manager',
  ADD COLUMN IF NOT EXISTS notify_max_extra_phones    text NULL;

-- MAX-номер для каждого пользователя (брокера и других ролей)
ALTER TABLE t_p71821556_real_estate_catalog_.users
  ADD COLUMN IF NOT EXISTS max_phone varchar(30) NULL;
