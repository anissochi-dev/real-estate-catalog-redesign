export const SEO_BASE = 'https://functions.poehali.dev/068e7fac-cea4-46c6-9ad2-a02f1f5e250d';

/**
 * Билдер URL для SEO-функции.
 * Cloud Functions Gateway режет заголовок X-Auth-Token на POST/JSON,
 * поэтому ВСЕГДА дублируем токен в query-параметр auth_token.
 * Если переданный токен пустой — пробуем достать из localStorage.
 */
export const seoUrl = (token: string) => {
  let t = token;
  if (!t) {
    try { t = localStorage.getItem('biznest_token') || ''; } catch { /* ignore */ }
  }
  return t ? `${SEO_BASE}?auth_token=${encodeURIComponent(t)}` : SEO_BASE;
};

/** Безопасный билдер заголовков с токеном — дублируем в нескольких полях,
 * так как разные шлюзы режут разные заголовки. */
export const seoHeaders = (token: string): Record<string, string> => {
  let t = token;
  if (!t) {
    try { t = localStorage.getItem('biznest_token') || ''; } catch { /* ignore */ }
  }
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t) {
    h['X-Auth-Token'] = t;
    h['X-Authorization'] = t;
    h['Authorization'] = `Bearer ${t}`;
  }
  return h;
};

export const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00 UTC (${String((i + 3) % 24).padStart(2, '0')}:00 МСК)`,
}));

export interface SeoStatus {
  total_active: number;
  no_seo_title: number;
  no_seo_desc: number;
  no_desc: number;
  // Поля files_status (для TechnicalTab)
  robots_exists?: boolean;
  sitemap_exists?: boolean;
  sitemap_urls_count?: number;
  sitemap_updated_at?: string | null;
}

export interface Schedule {
  id?: number;
  is_enabled: boolean;
  run_hour: number;
  batch_limit: number;
  last_run_at?: string | null;
  last_run_processed?: number | null;
  last_run_errors?: number | null;
}

export interface RunLog {
  id: number;
  triggered_by: string;
  processed: number;
  errors: number;
  total: number;
  dry_run: boolean;
  started_at: string;
  finished_at?: string | null;
}

export interface SeoResult {
  id: number;
  status: 'ok' | 'error';
  seo_title?: string;
  seo_description?: string;
  error?: string;
}

export const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'Вручную', color: 'text-blue-600 bg-blue-50' },
  schedule: { label: 'Расписание', color: 'text-emerald-600 bg-emerald-50' },
  preview: { label: 'Превью', color: 'text-amber-600 bg-amber-50' },
};

export const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

export const fmtDuration = (start: string, end?: string | null) => {
  if (!end) return '';
  const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (sec < 60) return `${sec}с`;
  return `${Math.floor(sec / 60)}м ${sec % 60}с`;
};