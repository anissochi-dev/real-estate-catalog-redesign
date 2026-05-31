import { AiAction, AgentAction, VbRole } from '@/lib/adminApi';

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
  /** Какую роль ВБ применил к этому ответу (только у сообщений ai) */
  vbRole?: VbRole;
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
  { id: 'shorten_titles', label: 'Сократить названия', icon: 'Scissors', action: 'agent', prompt: 'Найди все активные объекты с длинными названиями (более 70 символов) и перепиши их через bulk_shorten_titles в короткие SEO-заголовки 50-65 символов. Сначала запусти scan_long_titles, затем bulk_shorten_titles с первыми 15-20 id.' },
  { id: 'analytics_full', label: 'Аналитика', icon: 'BarChart3', action: 'agent', prompt: 'Проведи полный анализ: объекты, лиды, конверсия, тренды, проблемные зоны. Дай структурированный отчёт с рекомендациями.' },
  { id: 'leads', label: 'Лиды', icon: 'Inbox', action: 'agent', prompt: 'Проверь все новые и ожидающие лиды. Предложи ответы клиентам, одобри подходящие заявки, закрой нерелевантные.' },
  { id: 'security', label: 'Безопасность', icon: 'ShieldCheck', action: 'agent', prompt: 'Проверь сайт: целостность данных, XSS-уязвимости, подозрительная активность, SEO-соответствие. Дай отчёт.' },
  { id: 'marketing', label: 'Маркетинг', icon: 'TrendingUp', action: 'agent', prompt: 'Проанализируй каталог с маркетинговой точки зрения: конверсия, ЦА, ценообразование, позиционирование. Предложи конкретные шаги.' },
  { id: 'seo_fix', label: 'SEO', icon: 'Search', action: 'agent', prompt: 'Найди все объекты без SEO-заголовков и описаний. Сгенерируй и примени SEO для каждого.' },
  { id: 'photos', label: 'Фото', icon: 'Image', action: 'agent', prompt: 'Сканируй фотографии: найди неиспользуемые и большие файлы-кандидаты на сжатие. Предложи оптимизацию.' },
  { id: 'find_lead', label: 'Найти заявку', icon: 'PhoneSearch', action: 'agent', prompt: 'Найди заявку по номеру телефона или id. Покажи статус, имя клиента, сообщение и когда поступила.' },
  { id: 'ask_knowledge', label: 'База знаний', icon: 'BookOpen', action: 'agent', prompt: 'Найди в базе знаний информацию по моему вопросу. Используй search_knowledge.' },
  { id: 'notify_team', label: 'Уведомить команду', icon: 'BellRing', action: 'agent', prompt: 'Составь и отправь уведомление сотруднику. Используй notify_employee.' },
  { id: 'guardian', label: '🛡️ Страж', icon: 'ShieldCheck', action: 'agent', prompt: 'Запусти полное сканирование безопасности сайта: XSS в объектах, спам-телефоны, SQL-инъекции в заявках, аномальные данные. Используй guardian_full_scan, затем предложи guardian_block для найденных угроз.' },
  { id: 'inspector', label: '🔍 Инспектор', icon: 'ClipboardList', action: 'agent', prompt: 'Запусти полный аудит сайта: SEO, битые данные, дубли, устаревшие объекты, необработанные лиды. Используй inspector_full_audit.' },
  { id: 'copywriter', label: '✍️ Копирайтер', icon: 'PenLine', action: 'agent', prompt: 'Предложи темы для статей блога на основе каталога и запросов клиентов. Используй copywriter_get_topics, затем предложи написать статью через copywriter_write_article.' },
  { id: 'dispatcher', label: '🎛️ Диспетчер', icon: 'Zap', action: 'agent', prompt: 'Покажи статус всех модулей (dispatcher_get_status), затем запусти все включённые модули через dispatcher_run_all.' },
  { id: 'devops', label: '🛠️ DevOps', icon: 'Github', action: 'agent', prompt: 'Проверь GitHub: подключение, последние коммиты, открытые issues, статус Actions. Используй devops_check_github, затем devops_get_commits и devops_get_issues.' },
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
  bulk_shorten_titles: { label: 'Сократить названия', icon: 'Scissors' },
  scan_long_titles: { label: 'Сканер длинных названий', icon: 'Ruler' },
  update_listing_full: { label: 'Редактировать объект', icon: 'Edit3' },
  update_news: { label: 'Редактировать новость', icon: 'Newspaper' },
  create_news: { label: 'Создать новость', icon: 'FilePlus' },
  update_lead: { label: 'Редактировать заявку', icon: 'UserCog' },
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
  // Поиск и коммуникация
  lookup_lead: { label: 'Найти заявку', icon: 'Search' },
  search_knowledge: { label: 'Поиск в базе знаний', icon: 'BookOpen' },
  assign_broker: { label: 'Назначить брокера', icon: 'UserCheck' },
  send_email_to_lead: { label: 'Письмо клиенту', icon: 'Mail' },
  notify_employee: { label: 'Уведомить сотрудника', icon: 'BellRing' },
  // Изображения
  scan_images: { label: 'Сканировать фото', icon: 'ScanLine' },
  optimize_images: { label: 'Оптимизировать фото', icon: 'ImageDown' },
  delete_unused_images: { label: 'Удалить неиспользуемые', icon: 'Trash2' },
  // 🛡️ Страж
  guardian_full_scan: { label: 'Страж: сканирование', icon: 'ShieldCheck' },
  guardian_block: { label: 'Заблокировать', icon: 'ShieldOff' },
  guardian_unblock: { label: 'Разблокировать', icon: 'ShieldCheck' },
  guardian_get_blocks: { label: 'Список блокировок', icon: 'List' },
  // 🔍 Инспектор
  inspector_full_audit: { label: 'Инспектор: аудит', icon: 'ClipboardList' },
  inspector_check_typos: { label: 'Проверка опечаток', icon: 'SpellCheck' },
  inspector_get_reports: { label: 'Отчёты модулей', icon: 'FileText' },
  // ✍️ Копирайтер
  copywriter_write_article: { label: 'Написать статью', icon: 'PenLine' },
  copywriter_rewrite_tov: { label: 'Переписать под TOV', icon: 'RefreshCw' },
  copywriter_get_topics: { label: 'Темы для блога', icon: 'Lightbulb' },
  // 🎛️ Диспетчер
  dispatcher_run_module: { label: 'Запустить модуль', icon: 'Play' },
  dispatcher_run_all: { label: 'Запустить все модули', icon: 'Zap' },
  dispatcher_get_status: { label: 'Статус модулей', icon: 'LayoutDashboard' },
  dispatcher_toggle_module: { label: 'Вкл/выкл модуль', icon: 'ToggleLeft' },
  // 🛠️ DevOps
  devops_check_github: { label: 'GitHub: статус', icon: 'Github' },
  devops_get_commits: { label: 'Последние коммиты', icon: 'GitCommit' },
  devops_get_issues: { label: 'Issues / баги', icon: 'GitPullRequest' },
  devops_create_issue: { label: 'Создать issue', icon: 'FilePlus' },
  devops_get_workflows: { label: 'GitHub Actions', icon: 'Workflow' },
  devops_analyze_errors: { label: 'Анализ ошибок', icon: 'Bug' },
  devops_get_repo_stats: { label: 'Статистика репо', icon: 'BarChart2' },
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
  'scan_long_titles',
  'lookup_lead',
  'search_knowledge',
  'scan_images',
  // Страж
  'guardian_full_scan',
  'guardian_get_blocks',
  // Инспектор
  'inspector_full_audit',
  'inspector_check_typos',
  'inspector_get_reports',
  // Копирайтер
  'copywriter_get_topics',
  // Диспетчер
  'dispatcher_run_module',
  'dispatcher_run_all',
  'dispatcher_get_status',
  // DevOps
  'devops_check_github',
  'devops_get_commits',
  'devops_get_issues',
  'devops_get_workflows',
  'devops_analyze_errors',
  'devops_get_repo_stats',
]);

/** Поля объекта/лида/новости, безопасные для автоприменения (без подтверждения).
 *  Цена, статус, адрес, контакты — сюда НЕ входят. */
export const SAFE_LISTING_FIELDS = new Set([
  'description', 'tags', 'seo_title', 'seo_description',
  'purpose', 'condition', 'parking', 'entrance', 'finishing',
  'road_line', 'utilities', 'building_class', 'broker_commission',
  'video_url', 'video_type',
  'is_hot', 'is_new', 'is_exclusive', 'is_urgent', 'is_apartments',
  'has_furniture', 'has_equipment', 'use_watermark',
  'export_yandex', 'export_avito', 'export_cian',
  'is_visible', 'is_pinned',
]);

export const SAFE_NEWS_FIELDS = new Set([
  'summary', 'content', 'image_url', 'source_url', 'source_name', 'category',
]);

export const SAFE_LEAD_FIELDS = new Set([
  'message', 'source', 'request_category', 'lead_type',
  'is_public', 'show_on_main', 'is_network', 'is_network_tenant',
]);

/** Проверяет можно ли автоматически применить действие (без подтверждения).
 *  Для update_listing_full / update_news / update_lead — true только если ВСЕ
 *  изменяемые поля — из безопасного списка. */
export function isAutoApplicableAction(type: string, params?: Record<string, unknown>): boolean {
  if (AUTO_APPLY_ACTIONS.has(type)) return true;
  const fields = (params?.fields as Record<string, unknown>) || null;
  if (!fields || typeof fields !== 'object') return false;
  const keys = Object.keys(fields);
  if (keys.length === 0) return false;
  if (type === 'update_listing_full') return keys.every(k => SAFE_LISTING_FIELDS.has(k));
  if (type === 'update_news') return keys.every(k => SAFE_NEWS_FIELDS.has(k));
  if (type === 'update_lead') return keys.every(k => SAFE_LEAD_FIELDS.has(k));
  return false;
}

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