export const STATS_URL = 'https://functions.poehali.dev/1d84bd40-ef8c-4bd3-82c3-af294b1ec0b1';

export type ChangeValue = unknown;
export type ChangesMap = Record<string, [ChangeValue, ChangeValue] | { old?: ChangeValue; new?: ChangeValue } | ChangeValue>;

export interface HistoryItem {
  id: number;
  listing_id: number;
  user_name: string;
  action: string;
  changes: ChangesMap | null;
  created_at: string;
}

export interface OldStats {
  total_views: number;
  views_30d: number;
  views_7d: number;
  leads_total: number;
  leads_30d: number;
  daily: { stat_date: string; views_count: number; leads_count: number }[];
}

export interface AggRow { event_type: string; source: string; total: number; last_at: string }
export interface HistoryRow { id: number; event_type: string; source: string; count: number; note: string | null; recorded_at: string; user_name: string | null }

export interface MultiStats {
  listing_id: number;
  views_site: number;
  aggregated: AggRow[];
  source_totals: Record<string, number>;
  event_totals: Record<string, number>;
  source_labels: Record<string, string>;
  event_labels: Record<string, string>;
  history: HistoryRow[];
}

export const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  created: { label: 'Создан', icon: 'Plus', color: 'text-emerald-600 bg-emerald-50' },
  updated: { label: 'Изменён', icon: 'Pencil', color: 'text-blue-600 bg-blue-50' },
  archived: { label: 'Архивирован', icon: 'Archive', color: 'text-orange-600 bg-orange-50' },
  restored: { label: 'Восстановлен', icon: 'RotateCcw', color: 'text-violet-600 bg-violet-50' },
  photo_added: { label: 'Фото добавлено', icon: 'Image', color: 'text-sky-600 bg-sky-50' },
  photo_removed: { label: 'Фото удалено', icon: 'ImageOff', color: 'text-red-600 bg-red-50' },
  price_changed: { label: 'Цена изменена', icon: 'TrendingDown', color: 'text-amber-600 bg-amber-50' },
  status_changed: { label: 'Статус изменён', icon: 'RefreshCw', color: 'text-violet-600 bg-violet-50' },
  broker_changed: { label: 'Брокер изменён', icon: 'UserCheck', color: 'text-indigo-600 bg-indigo-50' },
  shown: { label: 'Показан на сайте', icon: 'Eye', color: 'text-emerald-600 bg-emerald-50' },
  hidden: { label: 'Скрыт с сайта', icon: 'EyeOff', color: 'text-red-600 bg-red-50' },
};

export const FIELD_LABELS: Record<string, string> = {
  title: 'Название', description: 'Описание', category: 'Категория', deal: 'Тип сделки',
  price: 'Цена', area: 'Площадь', address: 'Адрес', real_address: 'Реальный адрес', district: 'Район', city: 'Город',
  status: 'Статус', owner_name: 'Имя собственника', owner_phone: 'Телефон собственника',
  owner_phone2: 'Доп. телефон', purpose: 'Назначение', condition: 'Состояние',
  floor: 'Этаж', total_floors: 'Этажей всего', rooms: 'Комнат',
  parking: 'Парковка', entrance: 'Вход', access_type: 'Доступ', legal_address_provided: 'Юр. адрес предоставляется',
  video_url: 'Видео', video_type: 'Тип видео',
  is_hot: 'Горячее', is_new: 'Новинка', is_exclusive: 'Эксклюзив',
  is_urgent: 'Срочно', is_visible: 'Видимость на сайте',
  use_watermark: 'Водяной знак', export_yandex: 'Яндекс',
  export_avito: 'Авито', export_cian: 'ЦИАН', export_youla: 'Юла', tenant_name: 'Арендатор',
  monthly_rent: 'Аренда в мес.', yearly_rent: 'Аренда в год', finishing: 'Отделка',
  ceiling_height: 'Высота потолков', electricity_kw: 'Электричество',
  utilities: 'Коммунальные', road_line: 'Линия', payback: 'Окупаемость', profit: 'Прибыль',
  price_per_m2: 'Цена за м²', slug: 'Слаг', seo_title: 'SEO заголовок',
  seo_description: 'SEO описание', image: 'Фото', images: 'Фотографии', tags: 'Теги',
  lat: 'Широта', lng: 'Долгота', broker_id: 'Брокер',
  broker_commission: 'Комиссия брокера', price_unit: 'Единица цены',
};

export const FIELD_FMT: Record<string, (v: unknown) => string> = {
  price: v => v == null || v === '' ? '—' : `${Number(v).toLocaleString('ru')} ₽`,
  monthly_rent: v => v == null || v === '' ? '—' : `${Number(v).toLocaleString('ru')} ₽/мес`,
  yearly_rent: v => v == null || v === '' ? '—' : `${Number(v).toLocaleString('ru')} ₽/год`,
  profit: v => v == null || v === '' ? '—' : `${Number(v).toLocaleString('ru')} ₽/мес`,
  price_per_m2: v => v == null || v === '' ? '—' : `${Number(v).toLocaleString('ru')} ₽/м²`,
  area: v => v == null || v === '' ? '—' : `${v} м²`,
  is_hot: v => v ? 'Да' : 'Нет',
  is_new: v => v ? 'Да' : 'Нет',
  is_exclusive: v => v ? 'Да' : 'Нет',
  is_urgent: v => v ? 'Да' : 'Нет',
  is_visible: v => v ? 'Виден' : 'Скрыт',
  use_watermark: v => v ? 'Вкл' : 'Выкл',
  export_yandex: v => v ? 'Вкл' : 'Выкл',
  export_avito: v => v ? 'Вкл' : 'Выкл',
  export_cian: v => v ? 'Вкл' : 'Выкл',
  export_youla: v => v ? 'Вкл' : 'Выкл',
  status: v => ({ active: 'Активен', archived: 'В архиве', draft: 'Черновик', moderation: 'На модерации' } as Record<string, string>)[String(v)] || String(v ?? '—'),
  deal: v => ({ sale: 'Продажа', rent: 'Аренда', business: 'Бизнес' } as Record<string, string>)[String(v)] || String(v ?? '—'),
};

export const EMPTY = 'Не указано';

export const fmtVal = (field: string, val: unknown): string => {
  const f = FIELD_FMT[field];
  if (f) {
    const r = f(val);
    return r === '—' ? EMPTY : r;
  }
  if (val === null || val === undefined || val === '') return EMPTY;
  if (typeof val === 'boolean' || val === 'true' || val === 'false') return val === true || val === 'true' ? 'Да' : 'Нет';
  if (typeof val === 'string' && val.length > 80) return val.slice(0, 80) + '…';
  return String(val);
};

export const extractOldNew = (raw: ChangesMap[string]): { old: ChangeValue; new: ChangeValue } => {
  if (Array.isArray(raw) && raw.length >= 2) return { old: raw[0], new: raw[1] };
  if (raw && typeof raw === 'object' && ('old' in raw || 'new' in raw)) {
    const r = raw as { old?: ChangeValue; new?: ChangeValue };
    return { old: r.old, new: r.new };
  }
  return { old: undefined, new: raw };
};

export const SOURCES = [
  { value: 'avito', label: 'Авито', icon: 'ShoppingBag', color: 'text-green-600' },
  { value: 'cian', label: 'ЦИАН', icon: 'Building2', color: 'text-blue-600' },
  { value: 'yandex', label: 'Яндекс Недвижимость', icon: 'Home', color: 'text-red-500' },
  { value: 'domclick', label: 'Домклик', icon: 'MousePointer', color: 'text-emerald-600' },
  { value: 'xml', label: 'XML-выгрузка', icon: 'FileCode', color: 'text-slate-500' },
  { value: 'other', label: 'Другое', icon: 'Globe', color: 'text-muted-foreground' },
];

export const EVENT_TYPES = [
  { value: 'view_avito', label: 'Просмотры' },
  { value: 'call', label: 'Звонки' },
  { value: 'lead', label: 'Заявки' },
  { value: 'favorite', label: 'В избранном' },
  { value: 'manual', label: 'Прочее' },
];

export const EVENT_LABELS_FALLBACK: Record<string, string> = {
  view_avito: 'Просмотры', view_cian: 'Просмотры', view_yandex: 'Просмотры',
  view_domclick: 'Просмотры', view_xml: 'Просмотры', view_site: 'Просмотры сайта',
  view_other: 'Просмотры', call: 'Звонки', lead: 'Заявки',
  favorite: 'В избранном', manual: 'Прочее', qr_scan: 'Переходы по QR-коду',
};

export const isEmptyChanges = (c: ChangesMap | null) => !c || Object.keys(c).length === 0;

export const GROUP_WINDOW_MS = 10 * 60 * 1000;

export function groupHistory(items: HistoryItem[]): HistoryItem[] {
  const visible = items.filter(h => !(h.action === 'updated' && isEmptyChanges(h.changes)));
  const result: HistoryItem[] = [];
  for (const h of visible) {
    const prev = result[result.length - 1];
    if (
      prev && prev.action === 'updated' && h.action === 'updated' &&
      prev.user_name === h.user_name &&
      Math.abs(new Date(prev.created_at).getTime() - new Date(h.created_at).getTime()) <= GROUP_WINDOW_MS
    ) {
      const merged: ChangesMap = { ...(h.changes || {}) };
      for (const [field, raw] of Object.entries(prev.changes || {})) {
        if (field in merged) {
          const older = extractOldNew(merged[field]);
          const newer = extractOldNew(raw);
          merged[field] = { old: older.old, new: newer.new };
        } else {
          merged[field] = raw;
        }
      }
      result[result.length - 1] = { ...prev, changes: merged };
    } else {
      result.push(h);
    }
  }
  return result;
}

export function fmtDt(s: string) {
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
