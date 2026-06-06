-- Исправляем несовпадающие названия районов у 2 объектов
UPDATE t_p71821556_real_estate_catalog_.listings SET district = 'Центральный (ЦМР)' WHERE id = 56;
UPDATE t_p71821556_real_estate_catalog_.listings SET district = 'Школьный (ШМР)'    WHERE id = 160;
