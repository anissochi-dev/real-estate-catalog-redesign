import { getToken } from '@/lib/adminApi';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix_action?: string | null;
  view_action?: string | null;
}
export interface HealthResult { checks: Check[]; score: number; passed: number; total: number; }

export interface ViewItem {
  id?: number;
  title?: string;
  name?: string;
  email?: string;
  comment?: string;
  price?: number;
  created_at?: string;
  description_preview?: string;
  cnt?: number;
  ids?: number[];
}
export interface ViewResult { items: ViewItem[]; total: number; }

export interface SecurityResult {
  threats: { type: string; where: string }[];
  warnings: string[];
  threat_count: number;
  admins: string[];
  external_links_in_listings: number;
  old_inactive_users: number;
  api_key_configured: boolean;
  safe: boolean;
}

export interface PhotoResult {
  broken: { id: number; url: string; status: string | number }[];
  broken_count: number;
  ok_count: number;
  scanned: number;
  message: string;
}

export interface S3Result {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  folders: Record<string, number>;
  cdn_base: string;
}

export interface FeedItem { name: string; ok: boolean; status?: number; root_tag?: string; items?: number; size_kb?: number; error?: string; }
export interface XmlResult { feeds: FeedItem[]; all_ok: boolean; checked: number; }

export interface CleanAction {
  id: string; label: string; description: string; icon: string; danger?: boolean; confirm?: string;
}

export const CLEAN_ACTIONS: CleanAction[] = [
  { id: 'clear_old_sessions', label: 'Очистить истёкшие сессии', description: 'Удаляет просроченные сессии пользователей из БД', icon: 'LogOut' },
  { id: 'clear_ai_logs', label: 'Очистить логи ИИ (>30 дней)', description: 'Удаляет старые записи из журнала запросов к ИИ-ассистенту', icon: 'Trash2' },
  { id: 'clear_orphan_leads', label: 'Удалить пустые заявки', description: 'Удаляет заявки без телефона, созданные более 7 дней назад', icon: 'UserX', danger: true, confirm: 'Удалить заявки без номера телефона старше 7 дней?' },
  { id: 'vacuum_stats', label: 'Очистить старую статистику', description: 'Удаляет записи статистики просмотров старше 90 дней', icon: 'BarChart2', danger: true, confirm: 'Удалить статистику просмотров старше 90 дней?' },
  { id: 'fix_slugs', label: 'Исправить slug новостей', description: 'Генерирует slug для новостей, у которых он пустой', icon: 'Link' },
  { id: 'fix_broken_photos', label: 'Удалить битые фото', description: 'Проверяет и удаляет недоступные внешние фото из объявлений', icon: 'ImageOff', danger: true, confirm: 'Проверить и удалить все битые фото из объявлений?' },
];

export type Section = 'health' | 'security' | 'photos' | 's3' | 'xml' | 'clean';

export const SECTIONS: { id: Section; label: string; icon: string; desc: string }[] = [
  { id: 'health',   label: 'Диагностика',  icon: 'HeartPulse',  desc: 'Общая проверка сайта' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldAlert', desc: 'Антивирус и угрозы' },
  { id: 'photos',   label: 'Фото',         icon: 'ImageOff',    desc: 'Битые изображения' },
  { id: 's3',       label: 'Хранилище S3', icon: 'HardDrive',   desc: 'Файлы на CDN' },
  { id: 'xml',      label: 'XML-фиды',     icon: 'Rss',         desc: 'Авито, ЦИАН и др.' },
  { id: 'clean',    label: 'Обслуживание', icon: 'Wrench',      desc: 'Очистка и ремонт' },
];

const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

export function req(resource: string, opts?: RequestInit) {
  const token = getToken();
  const url = `${ADMIN_URL}?resource=${resource}${token ? `&auth_token=${encodeURIComponent(token)}` : ''}`;
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token, ...(opts?.headers || {}) },
  }).then(r => r.json());
}