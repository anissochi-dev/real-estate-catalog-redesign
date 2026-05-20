export type EventType = 'note' | 'event' | 'reminder';

export interface CrmEvent {
  id: number;
  title: string;
  description?: string;
  event_type: EventType;
  starts_at: string;
  ends_at?: string;
  is_done: boolean;
  deal_id?: number;
  owner_id?: number;
  listing_id?: number;
  deal_title?: string;
  owner_name?: string;
  listing_title?: string;
  creator_name?: string;
  assigned_name?: string;
}

export interface SearchItem {
  id: number;
  label: string;
  sub?: string;
}

export interface LinkField {
  deal_id: number | null;
  deal_label: string;
  owner_id: number | null;
  owner_label: string;
  listing_id: number | null;
  listing_label: string;
  lead_id?: number | null;
  lead_label?: string;
}

export interface EventFormState {
  title: string;
  description: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
}

export const TYPE_META: Record<EventType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  note:     { label: 'Заметка',     icon: 'StickyNote',    color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-300' },
  event:    { label: 'Событие',     icon: 'CalendarCheck', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-300'   },
  reminder: { label: 'Напоминание', icon: 'BellRing',      color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-300' },
};

export const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

export const EMPTY_FORM: EventFormState = {
  title: '', description: '', event_type: 'note', starts_at: '', ends_at: '',
};
export const EMPTY_LINKS: LinkField = {
  deal_id: null, deal_label: '',
  owner_id: null, owner_label: '',
  listing_id: null, listing_label: '',
};

export function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const dow   = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < dow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}