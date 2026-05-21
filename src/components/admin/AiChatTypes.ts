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
  { id: 'agent', label: 'Агент', icon: 'Bot', action: 'agent', prompt: 'Проанализируй текущее состояние каталога и лидов. Предложи самые важные действия, которые нужно выполнить прямо сейчас.' },
  { id: 'edit_site', label: 'Редактировать сайт', icon: 'Pencil', action: 'agent', prompt: 'Ты имеешь полный доступ к редактированию сайта. Проанализируй объекты каталога и предложи конкретные улучшения: обнови устаревшие описания, исправь SEO, обнови цены если нужно. Предложи действия через агента.' },
  { id: 'analytics_full', label: 'Полная аналитика', icon: 'BarChart3', action: 'analytics_full', prompt: 'Проведи полный анализ системы: объекты, лиды, конверсия, тренды. Дай структурированный отчёт.' },
  { id: 'improve_listings', label: 'Улучшить объекты', icon: 'Sparkles', action: 'agent', prompt: 'Найди объекты с пустыми описаниями, плохим SEO или некорректными данными. Предложи конкретные изменения для каждого — обнови через агента.' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', action: 'security', prompt: 'Проверь данные системы на XSS-инъекции, подозрительные паттерны и угрозы безопасности.' },
  { id: 'marketing', label: 'Маркетинг', icon: 'TrendingUp', action: 'marketing', prompt: 'Дай маркетинговые рекомендации по каталогу: конверсия, ЦА, ценообразование, позиционирование.' },
  { id: 'modernize', label: 'Оптимизация', icon: 'Zap', action: 'modernize', prompt: 'Предложи план улучшений контента каталога для повышения конверсии и SEO.' },
  { id: 'db_check', label: 'Проверка БД', icon: 'Database', action: 'db_check', prompt: 'Найди проблемы в данных: дубли, пустые поля, некорректные значения, устаревшие статусы.' },
  { id: 'help', label: 'Помощь', icon: 'MessageCircle', action: 'admin', prompt: '' },
  { id: 'desc', label: 'Описание', icon: 'PenLine', action: 'describe', prompt: '' },
  { id: 'reply', label: 'Ответ клиенту', icon: 'Mail', action: 'reply_lead', prompt: '' },
  { id: 'seo', label: 'SEO meta', icon: 'Search', action: 'seo', prompt: '' },
  { id: 'tags', label: 'Авто-теги', icon: 'Tags', action: 'auto_tags', prompt: '' },
  { id: 'moderate', label: 'Модерация', icon: 'CheckCircle2', action: 'moderate', prompt: '' },
];

export const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  update_listing: { label: 'Обновить объект', icon: 'Pencil' },
  archive_listing: { label: 'В архив', icon: 'Archive' },
  delete_listing: { label: 'Удалить объект', icon: 'Trash2' },
  reply_lead: { label: 'Ответить клиенту', icon: 'Send' },
  close_lead: { label: 'Закрыть лид', icon: 'CheckCircle2' },
  approve_lead: { label: 'Одобрить лид', icon: 'CheckCircle2' },
  generate_description: { label: 'Переписать описание', icon: 'PenLine' },
  seo_optimize: { label: 'Улучшить SEO', icon: 'Search' },
  bulk_update_status: { label: 'Массовый статус', icon: 'Layers' },
  security_check: { label: 'Проверка безопасности', icon: 'ShieldCheck' },
  analytics_report: { label: 'Аналитика', icon: 'BarChart3' },
  marketing_tips: { label: 'Маркетинг', icon: 'TrendingUp' },
  update_settings: { label: 'Обновить настройки', icon: 'Settings' },
  create_listing: { label: 'Создать объект', icon: 'PlusCircle' },
  note: { label: 'Совет', icon: 'Lightbulb' },
};

export const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

export const HISTORY_KEY = 'biznest_ai_chat_history';
export const HISTORY_LIMIT = 50;

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
    return Array.isArray(arr) ? arr.slice(-HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveHistory(msgs: Msg[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(msgs.slice(-HISTORY_LIMIT)));
  } catch {
    // ignore quota
  }
}