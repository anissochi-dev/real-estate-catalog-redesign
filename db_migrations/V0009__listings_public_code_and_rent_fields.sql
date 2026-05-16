-- Новые поля карточки объекта
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS public_code INTEGER,
  ADD COLUMN IF NOT EXISTS tenant_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS yearly_rent NUMERIC(14,2);

-- Уникальная последовательность для публичного кода объекта (стартует с 123456)
CREATE SEQUENCE IF NOT EXISTS listings_public_code_seq START WITH 123456 INCREMENT BY 1 MINVALUE 123456;

-- Заполняем public_code для уже существующих объектов
UPDATE listings
SET public_code = nextval('listings_public_code_seq')
WHERE public_code IS NULL;

-- Делаем дефолт для новых записей
ALTER TABLE listings
  ALTER COLUMN public_code SET DEFAULT nextval('listings_public_code_seq');

-- Уникальный индекс на public_code
CREATE UNIQUE INDEX IF NOT EXISTS listings_public_code_uidx ON listings (public_code);