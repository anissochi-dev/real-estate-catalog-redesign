export type TabId = 'overview' | 'price_history' | 'stats' | 'leads' | 'ai' | 'documents' | 'broker';

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
  { id: 'price_history', label: 'История цен', icon: 'TrendingDown' },
  { id: 'stats', label: 'Статистика', icon: 'BarChart2' },
  { id: 'leads', label: 'Заявки', icon: 'Inbox' },
  { id: 'ai', label: 'Мелания', icon: 'Sparkles' },
  { id: 'documents', label: 'Документы', icon: 'FileText' },
  { id: 'broker', label: 'Брокер', icon: 'UserCheck' },
];

export function fmt(n: number) { return n.toLocaleString('ru'); }
