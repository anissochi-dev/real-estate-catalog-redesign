export interface Criteria {
  id: number;
  title: string;
  is_active: boolean;
  platforms: string[];
  keywords_include: string[];
  keywords_exclude: string[];
  deal_types: string[];
  categories: string[];
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  districts: string[];
  require_price: boolean;
  require_area: boolean;
  require_phone: boolean;
  require_photo: boolean;
  require_address: boolean;
  route_to: string;
  run_interval_hours: number;
  last_run_at: string | null;
  next_run_at: string | null;
  pending_count: number;
}

export const PLATFORMS = [
  { id: 'vk',       label: 'ВКонтакте',     color: 'text-blue-600' },
  { id: 'ok',       label: 'Одноклассники', color: 'text-orange-500' },
  { id: 'telegram', label: 'Telegram',       color: 'text-sky-500' },
];

export const CATEGORIES_LIST = [
  { id: 'office',       label: 'Офис' },
  { id: 'retail',       label: 'Торговое' },
  { id: 'warehouse',    label: 'Склад' },
  { id: 'production',   label: 'Производство' },
  { id: 'catering',     label: 'Общепит' },
  { id: 'free_purpose', label: 'ПСН' },
  { id: 'building',     label: 'Здание' },
  { id: 'land',         label: 'Земля' },
  { id: 'car_service',  label: 'Автосервис' },
  { id: 'gab',          label: 'ГАБ' },
];

export const DISTRICTS_LIST = ['ФМР', 'ЦМР', 'ЮМР', 'Гидрострой', 'Музыкальный', 'Прикубанский', 'Карасунский', 'Западный'];

export const ROUTE_OPTIONS = [
  { id: 'moderation', label: 'В очередь модерации', desc: 'Брокер проверяет каждый пост вручную' },
  { id: 'leads',      label: 'Сразу в заявки',      desc: 'Без проверки, автоматически' },
  { id: 'listings',   label: 'Сразу в объекты',     desc: 'Черновик объекта без проверки' },
  { id: 'market',     label: 'Только статистика',   desc: 'В рыночную аналитику, без действий' },
];

export const INTERVALS = [1, 3, 6, 12, 24];

export const EMPTY_FORM = {
  title: '',
  platforms: ['telegram'] as string[],
  keywords_include: [] as string[],
  keywords_exclude: [] as string[],
  deal_types: [] as string[],
  categories: [] as string[],
  price_min: '',
  price_max: '',
  area_min: '',
  area_max: '',
  districts: [] as string[],
  require_price: false,
  require_area: false,
  require_phone: false,
  require_photo: false,
  require_address: false,
  route_to: 'moderation',
  run_interval_hours: 6,
  is_active: true,
};

export type CriteriaForm = typeof EMPTY_FORM;

export const routeLabel: Record<string, string> = {
  moderation: 'Модерация', leads: 'Заявки', listings: 'Объекты', market: 'Статистика',
};

export const routeColor: Record<string, string> = {
  moderation: 'bg-amber-50 text-amber-700',
  leads:      'bg-blue-50 text-blue-700',
  listings:   'bg-green-50 text-green-700',
  market:     'bg-slate-50 text-slate-600',
};

export function fmtDate(s: string | null): string {
  if (!s) return 'никогда';
  return new Date(s).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}
