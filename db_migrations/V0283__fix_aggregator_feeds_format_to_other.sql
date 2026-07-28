UPDATE t_p71821556_real_estate_catalog_.xml_feeds
SET format = 'other'
WHERE slug IN ('kvartiri-domiki', 'mirkvartir', 'nedvrf', 'bn', 'eip', 'gdeetotdom')
  AND format = 'yandex';