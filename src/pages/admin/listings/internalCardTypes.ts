export type TabId = 'overview' | 'photos' | 'price_history' | 'stats' | 'leads' | 'comments' | 'ai' | 'documents' | 'broker' | 'qr_banner';

export interface HistoryRow {
  id: number;
  action: string;
  changes?: Record<string, [unknown, unknown]>;
  created_at: string;
  user_name?: string;
}

export interface StatData {
  total_views?: number;
  total_calls?: number;
  total_leads?: number;
  daily?: { date: string; views?: number; calls?: number; leads?: number }[];
}

export interface InternalCardLead {
  id: number;
  name: string;
  phone: string;
  status: string;
  created_at: string;
  listing_id: number | null;
}

export interface BrokerUser {
  id: number;
  name: string;
  role: string;
}

export interface DbDoc {
  id: number;
  listing_id: number;
  name: string;
  url: string;
  created_at: string;
  uploader_name?: string;
}

export interface DbComment {
  id: number;
  listing_id: number;
  user_id: number;
  user_name: string;
  comment: string;
  is_ai: boolean;
  created_at: string;
}

export interface AiMsg {
  role: 'user' | 'ai';
  text: string;
}

export const LEAD_STATUS: Record<string, string> = {
  pending: 'На модерации', new: 'Новый', in_progress: 'В работе', done: 'Закрыт', rejected: 'Отказ',
};

export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор', icon: 'Info' },
  { id: 'photos', label: 'Фото', icon: 'Image' },
  { id: 'price_history', label: 'История цен', icon: 'TrendingDown' },
  { id: 'stats', label: 'Статистика', icon: 'BarChart2' },
  { id: 'leads', label: 'Заявки', icon: 'Inbox' },
  { id: 'comments', label: 'Чат команды', icon: 'MessageSquare' },
  { id: 'ai', label: 'ВБ', icon: 'Sparkles' },
  { id: 'documents', label: 'Документы', icon: 'FileText' },
  { id: 'broker', label: 'Брокер', icon: 'UserCheck' },
  { id: 'qr_banner', label: 'QR Баннер', icon: 'QrCode' },
];

export function fmt(n: number) { return n.toLocaleString('ru'); }

export const translate = (value: string | null | undefined, map: readonly (readonly string[])[]): string => {
  if (!value) return '—';
  const found = map.find(([key]) => key === value);
  return found ? found[1] : value;
};