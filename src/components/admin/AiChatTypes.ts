import { AiAction, AgentAction } from '@/lib/adminApi';

export interface AgentActionState extends AgentAction {
  status: 'pending' | 'applied' | 'rejected' | 'failed';
  resultMessage?: string;
}

export interface Msg {
  role: 'user' | 'ai';
  text: string;
  action?: AiAction;
  ts: number;
  suggestion?: Suggestion;
  status?: 'pending' | 'applied' | 'rejected';
  agentActions?: AgentActionState[];
  reasoning?: string;
}

export interface Suggestion {
  kind: 'description' | 'seo' | 'reply' | 'tags' | 'analytics' | 'generic';
  before?: string;
  after: string;
}

export interface QuickCmd {
  id: string;
  label: string;
  icon: string;
  action: AiAction;
  prompt: string;
}

export const QUICK_CMDS: QuickCmd[] = [
  { id: 'what_to_do', label: 'Что сделать?', icon: 'Sparkles', action: 'agent', prompt: 'Проанализируй текущее состояние сайта: каталог, лиды, SEO, данные. Предложи самые важные действия прямо сейчас — по приоритету.' },
  { id: 'edit_site', label: 'Улучшить объекты', icon: 'Pencil', action: 'agent', prompt: 'Найди объекты с пустыми описаниями, плохим SEO или некорректными данными. Предложи конкретные улучшения для каждого и выполни их.' },
  { id: 'analytics_full', label: 'Аналитика', icon: 'BarChart3', action: 'agent', prompt: 'Проведи полный анализ: объекты, лиды, конверсия, тренды, проблемные зоны. Дай структурированный отчёт с рекомендациями.' },
  { id: 'leads', label: 'Лиды', icon: 'Inbox', action: 'agent', prompt: 'Проверь все новые и ожидающие лиды. Предложи ответы клиентам, одобри подходящие заявки, закрой нерелевантные.' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', action: 'agent', prompt: 'Проверь сайт: целостность данных, XSS-уязвимости, подозрительная активность, SEO-соответствие. Дай отчёт.' },
  { id: 'marketing', label: 'Маркетинг', icon: 'TrendingUp', action: 'agent', prompt: 'Проанализируй каталог с маркетинговой точки зрения: конверсия, ЦА, ценообразование, позиционирование. Предложи конкретные шаги.' },
  { id: 'seo_fix', label: 'SEO', icon: 'Search', action: 'agent', prompt: 'Найди все объекты без SEO-заголовков и описаний. Сгенерируй и примени SEO для каждого.' },
  { id: 'photos', label: 'Фото', icon: 'Image', action: 'agent', prompt: 'Сканируй фотографии: найди неиспользуемые и большие файлы-кандидаты на сжатие. Предложи оптимизацию.' },
];

export const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  // Изменения
  update_listing: { label: 'Обновить объект', icon: 'Pencil' },
  archive_listing: { label: 'В архив', icon: 'Archive' },
  delete_listing: { label: 'Удалить объект', icon: 'Trash2' },
  reply_lead: { label: 'Ответить клиенту', icon: 'Send' },
  close_lead: { label: 'Закрыть лид', icon: 'CheckCircle2' },
  approve_lead: { label: 'Одобрить лид', icon: 'CheckCircle2' },
  generate_description: { label: 'Переписать описание', icon: 'PenLine' },
  seo_optimize: { label: 'Улучшить SEO', icon: 'Search' },
  bulk_update_status: { label: 'Массовый статус', icon: 'Layers' },
  bulk_generate_descriptions: { label: 'Массовые описания', icon: 'PenSquare' },
  bulk_seo_optimize: { label: 'Массовое SEO', icon: 'SearchCheck' },
  fix_data_quality: { label: 'Исправить качество', icon: 'Wrench' },
  update_settings: { label: 'Обновить настройки', icon: 'Settings' },
  create_listing: { label: 'Создать объект', icon: 'PlusCircle' },
  // Аналитика и сбор данных
  get_listings_summary: { label: 'Сводка по объектам', icon: 'BarChart3' },
  get_leads_summary: { label: 'Сводка по лидам', icon: 'Users' },
  get_conversion_analytics: { label: 'Конверсия', icon: 'TrendingUp' },
  get_recent_errors: { label: 'Последние ошибки', icon: 'AlertTriangle' },
  search_listings: { label: 'Поиск объектов', icon: 'Search' },
  analyze_user_behavior: { label: 'Поведение посетителей', icon: 'Activity' },
  get_content_recommendations: { label: 'Рекомендации контента', icon: 'Lightbulb' },
  // Безопасность
  check_data_integrity: { label: 'Целостность данных', icon: 'Database' },
  detect_suspicious_activity: { label: 'Подозрительная активность', icon: 'ShieldAlert' },
  scan_xss_vulnerabilities: { label: 'Сканер XSS', icon: 'Bug' },
  validate_seo_compliance: { label: 'SEO-соответствие', icon: 'CheckSquare' },
  security_check: { label: 'Проверка безопасности', icon: 'ShieldCheck' },
  analytics_report: { label: 'Аналитика', icon: 'BarChart3' },
  marketing_tips: { label: 'Маркетинг', icon: 'TrendingUp' },
  note: { label: 'Совет', icon: 'Lightbulb' },
};

// Действия с risk: low — это безопасные информационные действия,
// можно автоматически выполнять при появлении (Виртуальный брокер "собирает данные сам").
// Все остальные требуют явного подтверждения админа.
export const AUTO_APPLY_ACTIONS = new Set([
  'get_listings_summary',
  'get_leads_summary',
  'get_conversion_analytics',
  'get_recent_errors',
  'search_listings',
  'analyze_user_behavior',
  'get_content_recommendations',
  'check_data_integrity',
  'detect_suspicious_activity',
  'scan_xss_vulnerabilities',
  'validate_seo_compliance',
  'security_check',
  'analytics_report',
  'marketing_tips',
  'note',
]);

export const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export const HISTORY_KEY = 'biznest_ai_chat_history';
export const HISTORY_LIMIT_KEY = 'biznest_ai_chat_history_limit';
export const DEFAULT_HISTORY_LIMIT = 5000;
export const WARNING_THRESHOLD = 0.8; // 80% — жёлтое предупреждение
export const CRITICAL_THRESHOLD = 0.95; // 95% — красное предупреждение

/** Получить текущий лимит истории (по умолчанию 5000, можно увеличить вручную). */
export function getHistoryLimit(): number {
  try {
    const v = parseInt(localStorage.getItem(HISTORY_LIMIT_KEY) || '', 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* ignore */ }
  return DEFAULT_HISTORY_LIMIT;
}

/** Установить новый лимит (увеличение). */
export function setHistoryLimit(n: number) {
  try {
    localStorage.setItem(HISTORY_LIMIT_KEY, String(Math.max(100, Math.floor(n))));
  } catch { /* ignore */ }
}

// Обратная совместимость для импортов
export const HISTORY_LIMIT = DEFAULT_HISTORY_LIMIT;

export function detectSuggestion(text: string, action?: AiAction, currentText?: string): Suggestion | undefined {
  if (!text) return undefined;
  const cleanedText = text.trim();
  if (action === 'describe') return { kind: 'description', before: currentText, after: cleanedText };
  if (action === 'reply_lead') return { kind: 'reply', after: cleanedText };
  if (action === 'seo') return { kind: 'seo', after: cleanedText };
  if (action === 'auto_tags') return { kind: 'tags', after: cleanedText };
  if (action === 'analytics') return { kind: 'analytics', after: cleanedText };
  if (action === 'moderate') return { kind: 'generic', after: cleanedText };
  return undefined;
}

export function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Msg[];
    const limit = getHistoryLimit();
    return Array.isArray(arr) ? arr.slice(-limit) : [];
  } catch {
    return [];
  }
}

export function saveHistory(msgs: Msg[]) {
  try {
    const limit = getHistoryLimit();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-limit)));
  } catch {
    // ignore quota
  }
}

/** Полностью очистить историю. */
export function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

/** Очистить старые сообщения, оставив последние N. */
export function trimHistory(keepLast: number): Msg[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Msg[];
    if (!Array.isArray(arr)) return [];
    const kept = arr.slice(-keepLast);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    return kept;
  } catch {
    return [];
  }
}