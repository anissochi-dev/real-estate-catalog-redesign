export interface EgrnStoredObject {
  cadastral_number: string;
  address?: string;
  type?: string;
  area?: string;
  status?: string;
  ownership?: string;
  purpose?: string;
  floor?: string;
  reg_date?: string;
  cad_cost?: string;
  encumbrances?: { type?: string; date?: string }[];
  rights?: { type?: string; date?: string }[];
  fetched_at?: string;
}

export interface Listing {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  area: number;
  address: string;
  district: string;
  city: string;
  status: string;
  description: string;
  ai_notes?: string | null;
  image: string;
  images: string;
  tags: string[] | string;
  is_hot: boolean;
  is_new: boolean;
  owner_name: string | null;
  owner_phone: string | null;
  owner_phone2?: string | null;
  price_unit: 'm2' | 'sotka' | 'total' | string;
  purpose: string | null;
  condition: string | null;
  parking: string | null;
  entrance: string | null;
  floor: number | null;
  total_floors: number | null;
  video_url: string | null;
  video_type: string | null;
  use_watermark: boolean;
  export_yandex: boolean;
  export_avito: boolean;
  export_cian: boolean;
  created_at: string;
  updated_at: string;
  slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_h1: string | null;
  seo_h2: string | null;
  seo_h3: string | null;
  seo_h4: string | null;
  seo_h5: string | null;
  public_code?: number | null;
  tenant_name?: string | null;
  monthly_rent?: number | null;
  yearly_rent?: number | null;
  finishing?: string | null;
  ceiling_height?: number | null;
  electricity_kw?: number | null;
  utilities?: string | null;
  road_line?: string | null;
  payback?: number | null;
  profit?: number | null;
  price_per_m2?: number | null;
  is_exclusive?: boolean;
  is_urgent?: boolean;
  last_edited_at?: string | null;
  last_edited_by?: number | null;
  lat?: number | null;
  lng?: number | null;
  author_id?: number | null;
  broker_id?: number | null;
  broker_name?: string | null;
  is_visible?: boolean;
  rooms?: number | null;
  broker_commission?: string | null;
  building_class?: string | null;
  subway_station?: string | null;
  subway_distance?: number | null;
  land_area?: number | null;
  land_status?: string | null;
  land_vri?: string | null;
  has_furniture?: boolean;
  has_equipment?: boolean;
  property_rights?: string | null;
  min_area?: number | null;
  building_year?: number | null;
  is_apartments?: boolean;
  cadastral_number?: string | null;
  egrn_objects?: EgrnStoredObject[] | null;
  rent_index_pct?: number | null;
  // Сводная статистика — приходит вместе со списком объектов
  stats_views?: number | null;
  stats_calls?: number | null;
  stats_leads?: number | null;
  // Кол-во заявок, подходящих объекту по критериям авто-подбора (тип, категория, цена ±10%, площадь ±10%, город)
  matching_leads_count?: number | null;
}

export interface City { id: number; name: string; is_active: boolean }
export interface Purpose { id: number; name: string; slug: string; icon?: string | null; is_active?: boolean; sort_order?: number }
export interface LandVri { id: number; name: string; slug: string; is_active?: boolean }

export const CATS = [
  ['office', 'Офис'],
  ['retail', 'Магазин, торговое помещение'],
  ['warehouse', 'Склад'],
  ['restaurant', 'Общепит, кафе, ресторан'],
  ['hotel', 'Гостиница'],
  ['business', 'Готовый бизнес'],
  ['gab', 'Готовый арендный бизнес (ГАБ)'],
  ['production', 'Производственное помещение'],
  ['land', 'Земельный участок'],
  ['building', 'Отдельно стоящее здание'],
  ['free_purpose', 'Помещение свободного назначения'],
  ['car_service', 'Автосервис'],
];
export const DEALS: [string, string, string][] = [
  ['sale', 'Продажа', 'bg-emerald-100 text-emerald-700'],
  ['rent', 'Аренда', 'bg-blue-100 text-blue-700'],
];
export const CONDITIONS = [
  ['new', 'Дизайнерский ремонт'], ['euro', 'Евроремонт'], ['good', 'Косметический ремонт'],
  ['cosmetic', 'Предчистовая'], ['rough', 'Без отделки'], ['shellcore', 'Черновая отделка'],
];

// Маппинг condition → finishing (для автозаполнения при выгрузке на доски)
export const CONDITION_TO_FINISHING: Record<string, string> = {
  new: 'designer',
  euro: 'euro',
  good: 'cosmetic',
  cosmetic: 'pre_finish',
  rough: 'none',
  shellcore: 'rough',
};
export const PARKING = [['none', 'Нет'], ['street', 'На улице'], ['building', 'В здании']];
export const ENTRANCE = [['street', 'С улицы'], ['yard', 'Со двора']];

export const PURPOSE_LIST = [
  'Столовая', 'Кафе', 'Ресторан', 'Кофейня', 'Бургерная', 'Бар', 'Паб', 'Пиццерия',
  'Суши-бар/роллы', 'Пекарня-кондитерская', 'Шаурмичная/кебаб-хаус', 'Блинная/чебуречная',
  'Вок-кафе/лапшичная', 'Кальянная',
  'Частный детский сад', 'Дом престарелых/пансионат для пожилых', 'Хоспис',
  'Реабилитационный центр', 'Психологический центр', 'Стоматологическая клиника',
  'Медицинский центр', 'Ветеринарная клиника', 'Груминг-салон',
  'Салон красоты', 'Барбершоп', 'Косметологический центр/кабинет', 'Массажный салон',
  'Студия маникюра/педикюра', 'Студия депиляции/шугаринга', 'Тату-студия/перманентный макияж',
  'Продуктовый магазин', 'Магазин разливного пива', 'Алкомаркет/винотека',
  'Овощной/фруктовый', 'Мясная лавка/фермерские продукты', 'Зоомагазин',
  'Магазин одежды/обуви/аксессуаров', 'Магазин детских товаров/игрушек',
  'Книжный/канцелярский магазин', 'Цветочный магазин/салон цветов',
  'Хозтовары', 'Стройматериалы', 'Магазин автозапчастей/автохимии',
  'Табачный магазин/вейп-шоп', 'Аптека/аптечный киоск',
  'Автомойка', 'Автосервис/СТО/шиномонтаж', 'Химчистка-прачечная',
  'Ателье по ремонту одежды', 'Мастерская по ремонту обуви/сумок',
  'Часовая мастерская', 'Фотосалон/фотостудия', 'Копировальный центр/типография',
  'Фитнес-студия/тренажерный зал', 'Танцевальная школа/йога-центр',
  'Детский игровой лабиринт/игровая комната', 'Тир', 'Квест-комнаты',
  'Боулинг/бильярдный клуб', 'Караоке-клуб', 'Производство',
  'Хостел', 'Мини-отель/гостевой дом', 'Почасовой отель', 'База отдыха/глэмпинг',
  'Пункт выдачи заказов (ПВЗ)',
] as const;

export const FINISHING = [
  ['none', 'Без отделки'],
  ['rough', 'Черновая'],
  ['pre_finish', 'Предчистовая'],
  ['cosmetic', 'Косметический ремонт'],
  ['euro', 'Евроремонт'],
  ['designer', 'Дизайнерский ремонт'],
];

export const ROAD_LINES = [
  ['1', '1-я линия (фасад на дорогу)'],
  ['2', '2-я линия (внутри квартала)'],
  ['3', '3-я линия и дальше'],
  ['yard', 'Во дворе'],
];

export const BUILDING_CLASSES = [
  ['A', 'Класс A (премиум)'],
  ['A+', 'Класс A+'],
  ['B+', 'Класс B+'],
  ['B', 'Класс B'],
  ['C', 'Класс C'],
];

export const PROPERTY_RIGHTS = [
  ['ownership', 'Собственность'],
  ['lease', 'Аренда'],
  ['sublease', 'Субаренда'],
];

export const LAND_STATUSES = [
  ['izhs', 'ИЖС'],
  ['lph', 'ЛПХ'],
  ['snt', 'СНТ'],
  ['dni', 'ДНТ'],
  ['commercial', 'Коммерческое назначение'],
  ['agricultural', 'Сельскохозяйственное назначение'],
  ['industrial', 'Промышленное назначение'],
];

export const empty: Partial<Listing> = {
  title: '', category: '', deal: '', price: 0, area: 0,
  address: '', district: '', city: 'Краснодар', description: '', image: '', images: '', tags: '',
  status: 'active', is_hot: false, is_new: false, is_visible: true,
  owner_name: '', owner_phone: '', owner_phone2: '', price_unit: 'total',
  purpose: '', condition: '', parking: 'none', entrance: 'street',
  floor: null, total_floors: null, video_url: '', video_type: '',
  use_watermark: true, export_yandex: false, export_avito: false, export_cian: false,
  slug: null, seo_title: '', seo_description: '',
  tenant_name: '', monthly_rent: null, yearly_rent: null,
  finishing: '', ceiling_height: null, electricity_kw: null,
  utilities: '', road_line: '', payback: null, profit: null,
  is_exclusive: false, is_urgent: false,
  building_class: null, subway_station: '', subway_distance: null,
  land_area: null, land_status: null, has_furniture: false, has_equipment: false,
  property_rights: null, min_area: null, building_year: null, is_apartments: false,
};

export const fmtDate = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export const perM2 = (price: number, area: number) => {
  if (!price || !area) return 0;
  return Math.round(price / area);
};

export const detectVideoType = (url: string): string => {
  if (!url) return '';
  if (url.includes('vk.com') || url.includes('vkvideo')) return 'vk';
  if (url.includes('rutube.ru')) return 'rutube';
  return 'other';
};

export const splitImages = (raw: string | undefined): string[] => {
  if (!raw) return [];
  const sep = raw.includes('|') ? '|' : ',';
  return raw.split(sep).map(s => s.trim()).filter(Boolean);
};