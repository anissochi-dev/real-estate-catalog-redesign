import { getToken } from '@/lib/adminApi';

export const ADMIN_URL   = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';
export const TRACKER_URL = 'https://functions.poehali.dev/fcd92c6e-e089-41e3-93e9-5f05dcb73e47';

export const UTM_SOURCES  = ['avito', 'cian', 'yandex', 'google', 'vk', 'telegram', 'email', 'sms', 'instagram'];
export const UTM_MEDIUMS  = ['cpc', 'organic', 'social', 'email', 'referral', 'banner', 'sms'];
export const UTM_CAMPAIGNS_PRESET = ['spring_2025', 'office_rent', 'building_sale', 'hot_objects', 'promo'];

export const SOURCE_ICONS: Record<string, string> = {
  avito: '🟢', cian: '🔵', yandex: '🔴', google: '🟡',
  vk: '🔵', telegram: '🔷', email: '📧', sms: '💬', instagram: '🟣',
};

export type Period = 'today' | '30' | '90' | 'all';
export const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: '30',    label: '30 дней' },
  { value: '90',    label: '90 дней' },
  { value: 'all',   label: 'Всё время' },
];

export interface UtmLink {
  id: number;
  url: string;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  listing_id: number | null;
  listing_title: string | null;
  label: string | null;
  clicks_period: number;
  clicks_total: number;
  created_by_name: string | null;
  created_at: string | null;
}

export interface SourceStat {
  utm_source: string;
  links_count: number;
  clicks_period: number;
  clicks_total: number;
}

export interface Campaign { utm_campaign: string; clicks_period: number }
export interface TimelinePoint { day: string; cnt: number }

export type View = 'builder' | 'history' | 'stats';

export function adminUrl(resource: string, qs: Record<string, string | number> = {}) {
  const p = new URLSearchParams({ resource, ...Object.fromEntries(Object.entries(qs).map(([k, v]) => [k, String(v)])) });
  p.set('auth_token', getToken());
  return `${ADMIN_URL}?${p}`;
}

export function trackerUrl(qs: Record<string, string> = {}) {
  const p = new URLSearchParams({ ...qs, auth_token: getToken() });
  return `${TRACKER_URL}?${p}`;
}

export function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
