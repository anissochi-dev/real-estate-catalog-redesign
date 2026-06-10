export interface MemoryItem {
  id: number;
  key: string;
  value: string;
  updated_at: string | null;
}

export interface Usage {
  total_bytes: number;
  limit_bytes: number;
  usage_percent: number;
  items_count: number;
}

export interface RetrainSchedule {
  enabled: boolean;
  hour: number;
  minute: number;
  sources: string[];
  last_at: string | null;
  last_status: string | null;
  last_saved: number | null;
}

export const SUGGESTED_KEYS = [
  { prefix: 'glossary_', label: 'Глоссарий' },
  { prefix: 'faq_', label: 'FAQ' },
  { prefix: 'rule_', label: 'Бизнес-правило' },
  { prefix: 'contact_', label: 'Контакты/компания' },
  { prefix: 'process_', label: 'Процесс' },
  { prefix: 'persona', label: 'Личность ВБ' },
  { prefix: 'creator_', label: 'Создатель' },
  { prefix: 'personality', label: 'Личность ВБ' },
  { prefix: 'news_', label: 'Новости рынка' },
  { prefix: 'listing_', label: 'Из объектов' },
  { prefix: 'invest_', label: 'Инвестиции' },
  { prefix: 'demand_', label: 'Спрос клиентов' },
  { prefix: 'term_', label: 'Термины' },
];

export const TRAINING_SOURCES = [
  { id: 'news', label: 'Новости рынка', icon: 'Newspaper', hint: '15 последних новостей' },
  { id: 'listings', label: 'Объекты каталога', icon: 'Building2', hint: 'Описания, теги, характеристики (30 объектов)' },
  { id: 'invest', label: 'Инвест-модель', icon: 'TrendingUp', hint: 'Средние цены, окупаемость, ставки по категориям' },
  { id: 'demand', label: 'Заявки клиентов', icon: 'Inbox', hint: 'Что ищут — тренды спроса (60 заявок)' },
  { id: 'terms', label: 'Термины из описаний', icon: 'Quote', hint: 'Популярные ключевые слова и понятия' },
  { id: 'market_prices', label: 'Цены с агрегаторов', icon: 'Globe', hint: 'Парсинг Аякс, Этажи, ЦИАН — актуальные цены рынка' },
  { id: 'web_sources', label: 'Мои ссылки', icon: 'Link', hint: 'Сайты, добавленные вами для обучения ВБ' },
  { id: 'market_history', label: 'История рынка 2021–2026', icon: 'BarChart2', hint: 'Цены по годам, округам, категориям + макроэкономика' },
  { id: 'biweekly_history', label: 'Двухнедельная динамика 2019–2026', icon: 'TrendingUp', hint: '2544 среза цен продажи и аренды по 7 категориям каждые 2 недели' },
];

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

export function categoryByKey(key: string): string {
  for (const c of SUGGESTED_KEYS) {
    if (key === c.prefix || key.startsWith(c.prefix)) return c.label;
  }
  return 'Прочее';
}

export function fmtDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('ru', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return s;
  }
}