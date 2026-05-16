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
  image: string;
  images: string;
  tags: string[] | string;
  is_hot: boolean;
  is_new: boolean;
  owner_name: string | null;
  owner_phone: string | null;
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
}

export interface City { id: number; name: string; is_active: boolean }
export interface Purpose { id: number; name: string; slug: string }

export const CATS = [
  ['office', 'Офис'],
  ['retail', 'Торговое помещение'],
  ['warehouse', 'Склад'],
  ['restaurant', 'Общепит'],
  ['hotel', 'Гостиница'],
  ['business', 'Готовый бизнес'],
  ['gab', 'ГАБ'],
  ['production', 'Производственное помещение'],
  ['land', 'Земельный участок'],
  ['building', 'Отдельно стоящее здание'],
  ['free_purpose', 'Помещение свободного назначения'],
  ['car_service', 'Автосервис'],
];
export const DEALS: [string, string, string][] = [
  ['sale', 'Продажа', 'bg-emerald-100 text-emerald-700'],
  ['rent', 'Аренда', 'bg-blue-100 text-blue-700'],
  ['business', 'Готовый бизнес', 'bg-violet-100 text-violet-700'],
];
export const CONDITIONS = [
  ['new', 'Новое'], ['euro', 'Евроремонт'], ['good', 'Хорошее'],
  ['cosmetic', 'Требуется косметика'], ['rough', 'Без отделки'], ['shellcore', 'Shell&Core'],
];
export const PARKING = [['none', 'Нет'], ['street', 'На улице'], ['building', 'В здании']];
export const ENTRANCE = [['street', 'С улицы'], ['yard', 'Со двора']];

export const FINISHING = [
  ['none', 'Без отделки'],
  ['rough', 'Черновая'],
  ['preFinish', 'Предчистовая'],
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

export const empty: Partial<Listing> = {
  title: '', category: 'office', deal: 'sale', price: 0, area: 0,
  address: '', district: '', city: 'Краснодар', description: '', image: '', images: '', tags: '',
  status: 'active', is_hot: false, is_new: false,
  owner_name: '', owner_phone: '', price_unit: 'total',
  purpose: '', condition: '', parking: 'none', entrance: 'street',
  floor: null, total_floors: null, video_url: '', video_type: '',
  use_watermark: true, export_yandex: false, export_avito: false, export_cian: false,
  slug: null, seo_title: '', seo_description: '',
  tenant_name: '', monthly_rent: null, yearly_rent: null,
  finishing: '', ceiling_height: null, electricity_kw: null,
  utilities: '', road_line: '', payback: null, profit: null,
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