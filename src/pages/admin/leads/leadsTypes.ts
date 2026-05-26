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
  'property-page': 'Страница объекта',
  'offer-to-lead': 'Предложение объекта',
  'network-tenant': 'Сетевой арендатор',
  'catalog': 'Каталог',
  'homepage': 'Главная страница',
  'manual': 'Добавлен вручную',
};

export const empty: Partial<Lead> = {
  name: '', phone: '', email: '', message: '', status: 'new',
  is_network_tenant: false, show_on_main: true, budget: null, company: '',
};