UPDATE t_p71821556_real_estate_catalog_.listings
SET egrn_objects = '[
  {
    "cadastral_number": "23:43:0201028:598",
    "address": "Российская Федерация, Краснодарский край, г.о. город Краснодар, г Краснодар, ул Дальняя, д. 1/13",
    "type": "Здание",
    "area": "584.90",
    "status": "Актуально",
    "ownership": "Частная",
    "purpose": null,
    "floor": null,
    "reg_date": "2014-01-28",
    "cad_cost": "29208105.25",
    "encumbrances": [],
    "rights": [{"type": "Собственность", "date": "2016-04-21"}],
    "fetched_at": "2026-06-16T00:00:00.000Z"
  },
  {
    "cadastral_number": "23:43:0201028:1",
    "address": "Краснодарский край, г. Краснодар, Западный внутригородской округ, ул. Дальняя, 1/13",
    "type": "Земельный участок",
    "area": "71.92",
    "status": "Актуально",
    "ownership": "Частная",
    "purpose": null,
    "floor": null,
    "reg_date": null,
    "cad_cost": null,
    "encumbrances": [],
    "rights": [],
    "fetched_at": "2026-06-16T00:00:00.000Z"
  }
]'::jsonb
WHERE id = 179;