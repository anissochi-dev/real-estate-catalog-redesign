export interface PhoneContact {
  id: number;
  phone: string;
  name: string | null;
  company: string | null;
  notes: string | null;
  tags: string | null;
  inn: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  linked_listings?: { id: number; title: string; status: string; role: string; image?: string }[] | null;
  linked_leads?: { id: number; name: string; status: string; created_at: string }[] | null;
  trashed_at?: string | null;
  trashed_by_name?: string | null;
}

export interface HistoryEntry {
  id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

export interface PhoneForm {
  name: string;
  company: string;
  notes: string;
  tags: string;
  inn: string;
  photo_url: string;
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'ФИО', company: 'Компания', notes: 'Заметки',
  tags: 'Теги', inn: 'ИНН', phone: 'Телефон', photo_url: 'Фото',
};

export const EVENT_LABELS: Record<string, { label: string; icon: string; cls: string }> = {
  link_listing: { label: 'Привязан к объекту', icon: 'Link', cls: 'text-emerald-700 bg-emerald-50' },
  link_lead: { label: 'Привязан к лиду', icon: 'Link', cls: 'text-emerald-700 bg-emerald-50' },
  unlink_listing: { label: 'Отвязан от объекта', icon: 'Unlink', cls: 'text-red-700 bg-red-50' },
  unlink_lead: { label: 'Отвязан от лида', icon: 'Unlink', cls: 'text-red-700 bg-red-50' },
  trash: { label: 'Удалён в корзину', icon: 'Trash2', cls: 'text-red-700 bg-red-50' },
  restore: { label: 'Восстановлен', icon: 'RotateCcw', cls: 'text-emerald-700 bg-emerald-50' },
  auto_restore: { label: 'Восстановлен автоматически', icon: 'RotateCcw', cls: 'text-emerald-700 bg-emerald-50' },
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', done: 'Закрыт', rejected: 'Отказ',
};

export const LISTING_ROLE_LABELS: Record<string, string> = {
  owner: 'Собственник', agent: 'Агент', tenant: 'Арендатор',
};

export function fmtDt(s: string) {
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export type Tab = 'info' | 'links' | 'history';
