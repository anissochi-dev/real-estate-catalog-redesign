export interface NewsItem {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  content_preview?: string;
  content_length?: number;
  image_url?: string;
  source_url?: string;
  source_name?: string;
  is_published: boolean;
  is_auto: boolean;
  published_at?: string;
  created_at: string;
  category: string;
  cb_key_rate?: number | null;
}

export interface Schedule {
  id?: number;
  is_enabled: boolean;
  run_hour: number;
  run_minute: number;
  articles_per_run: number;
  topics?: string;
  last_run_at?: string;
  last_run_count?: number;
}

export const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:xx UTC (${String((i + 3) % 24).padStart(2, '0')}:xx МСК)`,
}));

export const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => ({
  value: m,
  label: String(m).padStart(2, '0'),
}));

export const AUTO_TOPICS = [
  'Ключевая ставка ЦБ РФ и рынок коммерческой недвижимости',
  'Аренда офисов в Краснодаре',
  'Склады и логистика Краснодарского края',
  'Торговые помещения Краснодара',
  'Готовый бизнес в Краснодаре',
  'Ипотека на коммерческую недвижимость 2025',
  'Застройщики Краснодара: новые объекты',
  'Инвестиции в ГАБ: доходность и риски',
  'Производственные помещения Кубани',
  'Рестораны и кафе: рынок аренды Краснодара',
  'Страхование коммерческой недвижимости',
  'Налоги при аренде и продаже коммерческой недвижимости',
];

export function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function generateNewsHeadings(title: string, summary: string) {
  const city = 'Краснодар';
  return {
    h1: title || `Новости коммерческой недвижимости ${city}`,
    h2: summary
      ? summary.split('.')[0].slice(0, 90)
      : `Аналитика рынка недвижимости ${city}`,
    h3: title
      ? `${title} — подробности`
      : `Обзор рынка коммерческой недвижимости`,
    h4: `Рынок коммерческой недвижимости ${city}`,
    h5: `Аренда и продажа объектов — актуальные данные`,
  };
}
