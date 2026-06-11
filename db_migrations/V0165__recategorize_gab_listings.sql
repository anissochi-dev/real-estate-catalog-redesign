-- Перекатегоризируем ГАБ-объявления которые были записаны в другие категории
UPDATE t_p71821556_real_estate_catalog_.market_listings
SET category = 'gab'
WHERE deal_type = 'sale'
  AND category != 'gab'
  AND (
    LOWER(title) LIKE '%с арендатор%'
    OR LOWER(title) LIKE '%арендный бизнес%'
    OR LOWER(title) LIKE '%готовый арендный%'
    OR LOWER(title) LIKE '%габ%'
    OR LOWER(description) LIKE '%готовый арендный бизнес%'
    OR LOWER(description) LIKE '%арендный поток%'
  );
