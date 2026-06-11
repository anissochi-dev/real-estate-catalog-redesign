-- Очищаем мусорные записи с пустым районом (обновляем значение чтобы было понятно что это устаревшие данные)
UPDATE t_p71821556_real_estate_catalog_.ai_memory
SET value = 'УСТАРЕЛО: данные без района, не использовать', updated_at = NOW()
WHERE key IN ('cian_district__rent', 'cian_district__sale');
