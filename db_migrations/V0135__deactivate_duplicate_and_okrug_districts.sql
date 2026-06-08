-- Деактивируем дубли и округа (не удаляем, чтобы не сломать FK)
UPDATE t_p71821556_real_estate_catalog_.districts
SET is_active = FALSE
WHERE slug IN (
  'gidrostroiteley',    -- дубль → каноничный Гидростроителей (ГМР)
  'komsomolskiy',       -- дубль → каноничный Комсомольский (КМР)
  'festivalnyy',        -- дубль → каноничный Фестивальный (ФМР)
  'yubileynyy',         -- дубль → каноничный Юбилейный (ЮМР)
  'novoznamenskiy',     -- дубль → каноничный Новознаменский п.
  'cheremushki-new',    -- дубль → каноничный Черёмушки (ЧМР)
  'cheremushki',        -- старый неактивный дубль
  'vostochnyy-vmr',     -- не самостоятельный район
  'zapadnyy-zmr',       -- не самостоятельный район
  'karasunsky-okrug',   -- округ, не район
  'prikubanskiy-okrug', -- округ, не район
  'tsentralnyy-okrug'   -- округ, не район
);
