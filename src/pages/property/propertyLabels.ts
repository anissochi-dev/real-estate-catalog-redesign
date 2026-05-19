export const TYPE_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Торговое помещение',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производственное помещение',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земельный участок',
  building: 'Отдельно стоящее здание',
  free_purpose: 'Помещение свободного назначения',
  car_service: 'Автосервис',
};

export const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес',
};

export const CONDITION_LABELS: Record<string, string> = {
  new: 'Новое', euro: 'Евроремонт', good: 'Хорошее',
  cosmetic: 'Требуется косметика', rough: 'Без отделки', shellcore: 'Черновая (Shell&Core)',
};

export const FINISHING_LABELS: Record<string, string> = {
  none: 'Без отделки', rough: 'Черновая', pre_finish: 'Предчистовая',
  cosmetic: 'Косметический ремонт', euro: 'Евроремонт', designer: 'Дизайнерский ремонт',
};

export const PARKING_LABELS: Record<string, string> = {
  none: 'Нет', street: 'На улице', building: 'В здании',
};

export const ENTRANCE_LABELS: Record<string, string> = {
  street: 'С улицы', yard: 'Со двора',
};

export const UTILITY_ICONS: Record<string, string> = {
  'Вода': 'Droplets',
  'Канализация': 'Waves',
  'Отопление': 'Flame',
  'Газ': 'Fuel',
  'Электричество': 'Zap',
  'Интернет': 'Wifi',
  'Вентиляция': 'Wind',
  'Кондиционирование': 'Thermometer',
  'Пожарная сигнализация': 'BellRing',
  'Видеонаблюдение': 'Camera',
};

export const ROAD_LINE_LABELS: Record<string, string> = {
  '1': '1-я линия (фасад на дорогу)',
  '2': '2-я линия (внутри квартала)',
  '3': '3-я линия и дальше',
  'yard': 'Во дворе',
};
