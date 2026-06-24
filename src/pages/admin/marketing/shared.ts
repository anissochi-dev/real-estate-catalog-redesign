// ── Общие типы, константы и утилиты для раздела Маркетолог ───────────────────

export interface MarketingStats {
  period?: string;
  period_days?: number | null;
  totals: {
    total_leads: number;
    leads_30d: number;
    total_views: number;
    active_listings: number;
    total_deals: number;
    total_commission?: number;
    won_deals?: number;
    qr_scans?: number;
  };
  leads_by_source: { source: string; cnt: number }[];
  leads_by_status: { status: string; cnt: number }[];
  leads_timeline: { day: string; cnt: number }[];
  leads_by_budget: { bucket: string; cnt: number }[];
  views_by_source: Record<string, Record<string, number>>;
  top_listings: { id: number; title: string; category: string; deal: string; views_site: number; price: number; district?: string; leads_count?: number; days_on_market?: number }[];
  listings_stats: { category: string; deal: string; cnt: number; total_views: number; avg_views: number }[];
  deals_by_source: { source: string; cnt: number; total_amount: number; total_commission?: number }[];
  qr_by_listing?: QrListingRow[];
}

export interface QrListingRow {
  listing_id: number;
  title: string | null;
  slug: string | null;
  category: string | null;
  deal: string | null;
  price: number | null;
  district: string | null;
  scans: number;
  last_scan: string | null;
}

export interface PriceResult {
  verdict: {
    label: string; color: string; delta_pct: number;
    market_min_price?: number; market_max_price?: number;
    market_median_per_m2?: number; user_price_per_m2?: number;
    suggested_price?: number; comment: string;
  };
  analogs_count: number;
  analogs: { source: string; price: number; area: number; price_per_m2: number; district?: string }[];
  sources: string[];
  demand_level?: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад', restaurant: 'Ресторан',
  hotel: 'Гостиница', business: 'Готовый бизнес', gab: 'ГАБ',
  production: 'Производство', land: 'Земля', building: 'Здание',
  free_purpose: 'Своб. назначения', car_service: 'Автосервис',
};

export const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда', business: 'Бизнес' };

export const STATUS_LABELS: Record<string, string> = {
  new: 'Новые', pending: 'На модерации', in_progress: 'В работе',
  closed: 'Закрытые', rejected: 'Отказ',
};

export const SOURCE_COLORS: Record<string, string> = {
  'Авито': 'bg-green-100 text-green-700',
  'авито': 'bg-green-100 text-green-700',
  'avito': 'bg-green-100 text-green-700',
  'ЦИАН': 'bg-blue-100 text-blue-700',
  'cian': 'bg-blue-100 text-blue-700',
  'Яндекс': 'bg-yellow-100 text-yellow-700',
  'yandex': 'bg-yellow-100 text-yellow-700',
  'site': 'bg-purple-100 text-purple-700',
  'admin': 'bg-slate-100 text-slate-600',
  'Не указан': 'bg-slate-100 text-slate-500',
};

export const COLOR_MAP: Record<string, { bar: string; badge: string; icon: string }> = {
  red:     { bar: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200',       icon: 'TrendingUp' },
  amber:   { bar: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'AlertTriangle' },
  green:   { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'CheckCircle2' },
  emerald: { bar: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',    icon: 'TrendingDown' },
  gray:    { bar: 'bg-slate-300',   badge: 'bg-slate-50 text-slate-600 border-slate-200', icon: 'HelpCircle' },
};

export const CATEGORIES = [
  { id: 'office', label: 'Офис' }, { id: 'retail', label: 'Торговое' },
  { id: 'warehouse', label: 'Склад' }, { id: 'building', label: 'Здание' },
  { id: 'free_purpose', label: 'Своб. назначения' }, { id: 'production', label: 'Производство' },
  { id: 'business', label: 'Готовый бизнес' }, { id: 'hotel', label: 'Гостиница' },
  { id: 'land', label: 'Земля' },
];

export const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';
export const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';

export function fmtMoney(n: number) {
  if (!n) return '0 ₽';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${Math.round(n).toLocaleString('ru')} ₽`;
}