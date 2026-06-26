export interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  listing_id: number | null;
  status: string;
  source: string;
  lead_type: string | null;
  created_at: string;
  budget: number | null;
  company: string | null;
  is_network_tenant: boolean;
  show_on_main: boolean;
  object_url?: string | null;
  broker_id?: number | null;
  /** true — телефон замаскирован сервером (нет прав видеть полностью) */
  phone_hidden?: boolean;
  seo_h1?: string | null;
  seo_h2?: string | null;
  seo_h3?: string | null;
  seo_h4?: string | null;
  seo_h5?: string | null;
  crm_deal_id?: number | null;
  area_from?: number | null;
  area_to?: number | null;
  property_type?: string | null;
  property_category?: string | null;
  utilities?: string | null;
}

export const LEAD_TYPES: [string, string, string][] = [
  ['view', 'Просмотр', 'bg-sky-100 text-sky-700'],
  ['offer', 'Предложить', 'bg-violet-100 text-violet-700'],
  ['callback', 'Перезвонить', 'bg-amber-100 text-amber-700'],
  ['manual', 'Ручная', 'bg-muted text-muted-foreground'],
];

export interface Comment { id: number; author_name: string; comment: string; created_at: string }
export interface Listing { id: number; title: string }

export const STATUSES: [string, string, string, string][] = [
  ['pending', 'На модерации', 'bg-orange-400', 'border-l-orange-400'],
  ['new', 'Новый', 'bg-emerald-500', 'border-l-emerald-500'],
  ['in_progress', 'В работе', 'bg-amber-500', 'border-l-amber-500'],
  ['done', 'Закрыт', 'bg-blue-500', 'border-l-blue-500'],
  ['rejected', 'Отказ', 'bg-red-500', 'border-l-red-500'],
];

export const SOURCE_LABELS: Record<string, string> = {
  'ai-chat': 'ИИ-чат',
  'property-page': 'Страница объекта',
  'offer-to-lead': 'Предложение объекта',
  'network-tenant': 'Сетевой арендатор',
  'catalog': 'Каталог',
  'homepage': 'Главная страница',
  'manual': 'Добавлен вручную',
};

export const PROPERTY_TYPES_LEAD = [
  { value: 'sale', label: 'Покупка' },
  { value: 'rent', label: 'Аренда' },
  { value: 'business', label: 'Готовый бизнес' },
];

export const PROPERTY_CATEGORIES_LEAD = [
  { value: 'office', label: 'Офис' },
  { value: 'retail', label: 'Магазин/торговое' },
  { value: 'warehouse', label: 'Склад' },
  { value: 'restaurant', label: 'Общепит' },
  { value: 'business', label: 'Готовый бизнес' },
  { value: 'production', label: 'Производство' },
  { value: 'hotel', label: 'Гостиница' },
  { value: 'gab', label: 'ГАБ' },
  { value: 'land', label: 'Земля' },
  { value: 'building', label: 'Здание' },
  { value: 'free_purpose', label: 'Своб. назнач.' },
  { value: 'car_service', label: 'Автосервис' },
];

export const empty: Partial<Lead> = {
  name: '', phone: '', email: '', message: '', status: 'new',
  is_network_tenant: false, show_on_main: true, budget: null, company: '',
  area_from: null, area_to: null, property_type: null, property_category: null, utilities: null,
};