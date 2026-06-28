-- Сбрасываем seo_faq для объектов у которых меньше 6 вопросов
UPDATE t_p71821556_real_estate_catalog_.listings
SET seo_faq = NULL
WHERE seo_faq IS NOT NULL
  AND jsonb_array_length(seo_faq) < 6;