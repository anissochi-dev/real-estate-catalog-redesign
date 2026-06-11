export interface SocialPost {
  id: number;
  platform: string;
  source_id: string;
  post_id: string;
  post_url: string | null;
  post_date: string | null;
  author_name: string | null;
  author_url: string | null;
  raw_text: string | null;
  photos: string[];
  detected_deal: string | null;
  detected_category: string | null;
  detected_price: number | null;
  detected_area: number | null;
  detected_address: string | null;
  detected_district: string | null;
  detected_phone: string | null;
  confidence: number | null;
  status: string;
  route_to: string | null;
  result_lead_id: number | null;
  result_listing_id: number | null;
  created_at: string;
}

export interface ApproveForm {
  name: string;
  phone: string;
  message: string;
  budget: string;
  lead_type: string;
  category: string;
  deal: string;
  price: string;
  area: string;
  address: string;
  district: string;
  description: string;
  status: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад', production: 'Производство',
  catering: 'Общепит', free_purpose: 'ПСН', building: 'Здание', land: 'Земля',
  car_service: 'Автосервис', gab: 'ГАБ', hotel: 'Гостиница', other: 'Прочее',
};

export const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export const PLATFORM_ICONS: Record<string, { label: string; color: string; icon: string }> = {
  vk:       { label: 'ВКонтакте',     color: 'text-blue-600',   icon: 'Users' },
  ok:       { label: 'Одноклассники', color: 'text-orange-500', icon: 'Users' },
  telegram: { label: 'Telegram',      color: 'text-sky-500',    icon: 'Send' },
};

export const CATEGORIES_LIST = [
  { id: 'office', label: 'Офис' }, { id: 'retail', label: 'Торговое' },
  { id: 'warehouse', label: 'Склад' }, { id: 'production', label: 'Производство' },
  { id: 'catering', label: 'Общепит' }, { id: 'free_purpose', label: 'ПСН' },
  { id: 'building', label: 'Здание' }, { id: 'land', label: 'Земля' },
  { id: 'car_service', label: 'Автосервис' }, { id: 'gab', label: 'ГАБ' },
];

export const DISTRICTS_LIST = ['ФМР', 'ЦМР', 'ЮМР', 'Гидрострой', 'Музыкальный', 'Прикубанский', 'Карасунский', 'Западный'];

export function fmtDate(s: string | null): string {
  if (!s) return '';
  return new Date(s).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс`;
  return String(n);
}

export function confidenceColor(c: number | null): string {
  if (!c) return 'text-muted-foreground';
  if (c >= 0.7) return 'text-green-600';
  if (c >= 0.4) return 'text-amber-600';
  return 'text-red-500';
}
