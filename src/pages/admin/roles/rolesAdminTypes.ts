import { Role } from '@/lib/adminApi';

export type Op = 'read' | 'create' | 'update' | 'delete';
export type ViewMode = 'role' | 'matrix' | 'nav';

export const ALL_ROLES_NAV: { id: string; label: string; color: string; bg: string; dot: string }[] = [
  { id: 'admin',          label: 'Администратор', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  dot: 'bg-violet-500' },
  { id: 'director',       label: 'Директор',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500' },
  { id: 'manager',        label: 'Менеджер',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'editor',         label: 'Редактор',      color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200',      dot: 'bg-sky-500' },
  { id: 'broker',         label: 'Брокер',        color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-500' },
  { id: 'office_manager', label: 'Офис-менеджер', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
];

export interface SectionDef {
  id: string;
  label: string;
  group: string;
  ops: Op[];
  icon: string;
}

export interface RolePerms {
  [section: string]: { [op in Op]?: boolean };
}

export interface AllPerms {
  [role: string]: RolePerms;
}

export const SECTIONS: SectionDef[] = [
  { id: 'dashboard',        label: 'Дашборд',           group: 'Основное', ops: ['read'],                             icon: 'LayoutDashboard' },
  { id: 'listings',         label: 'Объекты',            group: 'Основное', ops: ['read', 'create', 'update', 'delete'], icon: 'Building2' },
  { id: 'leads',            label: 'Заявки',             group: 'Основное', ops: ['read', 'create', 'update', 'delete'], icon: 'Inbox' },
  { id: 'news',             label: 'Новости',            group: 'Основное', ops: ['read', 'create', 'update', 'delete'], icon: 'Newspaper' },
  { id: 'phones',           label: 'Телефонная база',    group: 'Основное', ops: ['read', 'create', 'update', 'delete'], icon: 'Phone' },
  { id: 'users',            label: 'Пользователи',       group: 'Основное', ops: ['read', 'create', 'update', 'delete'], icon: 'Users' },
  { id: 'pages',            label: 'Страницы',           group: 'Контент',  ops: ['read', 'create', 'update', 'delete'], icon: 'FileText' },
  { id: 'seo',              label: 'SEO',                group: 'Контент',  ops: ['read', 'update'],                   icon: 'TrendingUp' },
  { id: 'districts',        label: 'Районы',             group: 'Контент',  ops: ['read', 'create', 'update', 'delete'], icon: 'MapPin' },
  { id: 'vb-knowledge',     label: 'База знаний ВБ',    group: 'Контент',  ops: ['read', 'create', 'update', 'delete'], icon: 'Brain' },
  { id: 'marketing',        label: 'Маркетолог',         group: 'Контент',  ops: ['read', 'update'],                   icon: 'Megaphone' },
  { id: 'market-import',    label: 'Импорт рынка',      group: 'Контент',  ops: ['read', 'create'],                   icon: 'Upload' },
  { id: 'settings',         label: 'Настройки',          group: 'Контент',  ops: ['read', 'update'],                   icon: 'Settings' },
  { id: 'crm-kanban',       label: 'Воронка сделок',    group: 'CRM',      ops: ['read', 'create', 'update', 'delete'], icon: 'KanbanSquare' },
  { id: 'crm-gamification', label: 'Рейтинг команды',   group: 'CRM',      ops: ['read'],                             icon: 'Trophy' },
  { id: 'crm-checks',       label: 'Проверки',           group: 'CRM',      ops: ['read', 'create'],                   icon: 'ShieldCheck' },
  { id: 'crm-payments',     label: 'Платежи',            group: 'CRM',      ops: ['read', 'create', 'update'],         icon: 'CreditCard' },
];

export const ROLES: { id: Role; label: string; color: string; bg: string; dot: string }[] = [
  { id: 'director',       label: 'Директор',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500' },
  { id: 'manager',        label: 'Менеджер',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'editor',         label: 'Редактор',      color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200',      dot: 'bg-sky-500' },
  { id: 'broker',         label: 'Брокер',        color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-500' },
  { id: 'office_manager', label: 'Офис-менеджер', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { id: 'client',         label: 'Клиент',        color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',  dot: 'bg-slate-400' },
];

export const OP_LABELS: Record<Op, string> = { read: 'Просмотр', create: 'Создание', update: 'Редактир.', delete: 'Удаление' };
export const OP_ICONS: Record<Op, string>  = { read: 'Eye', create: 'Plus', update: 'Pencil', delete: 'Trash2' };
export const OP_COLORS: Record<Op, string> = {
  read:   'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100',
  create: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
  update: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100',
  delete: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100',
};
export const OP_COLORS_OFF = 'text-muted-foreground bg-muted/40 border-border hover:bg-muted';

export const DEFAULT_PERMS: AllPerms = {
  director: {
    dashboard: { read: true },
    listings:  { read: true, create: true, update: true, delete: true },
    leads:     { read: true, create: true, update: true, delete: true },
    news:      { read: true, create: true, update: true, delete: true },
    phones:    { read: true, create: true, update: true, delete: true },
    users:     { read: true, create: true, update: true },
    pages:     { read: true, create: true, update: true },
    settings:  { read: true, update: true },
    marketing: { read: true, update: true },
    'vb-knowledge':     { read: true },
    'crm-kanban':       { read: true, create: true, update: true, delete: true },
    'crm-gamification': { read: true },
    'crm-checks':       { read: true, create: true },
    'crm-payments':     { read: true, create: true, update: true },
  },
  manager: {
    dashboard: { read: true },
    listings:  { read: true, create: true, update: true, delete: true },
    leads:     { read: true, create: true, update: true, delete: true },
    news:      { read: true, create: true, update: true },
    phones:    { read: true, create: true, update: true },
    marketing: { read: true },
    'crm-kanban':       { read: true, create: true, update: true },
    'crm-gamification': { read: true },
    'crm-checks':       { read: true },
    'crm-payments':     { read: true },
  },
  editor: {
    dashboard:     { read: true },
    listings:      { read: true, create: true, update: true },
    leads:         { read: true },
    news:          { read: true, create: true, update: true },
    phones:        { read: true, create: true, update: true },
    pages:         { read: true, create: true, update: true },
    settings:      { read: true, update: true },
    seo:           { read: true, update: true },
    districts:     { read: true, create: true, update: true },
    'vb-knowledge':  { read: true, create: true, update: true },
    marketing:       { read: true, update: true },
    'market-import': { read: true, create: true },
  },
  broker: {
    dashboard: { read: true },
    listings:  { read: true, create: true, update: true },
    leads:     { read: true, create: true },
    phones:    { read: true, create: true },
    'crm-kanban':       { read: true, create: true, update: true },
    'crm-gamification': { read: true },
    'crm-checks':       { read: true },
  },
  office_manager: {
    dashboard: { read: true },
    listings:  { read: true },
    leads:     { read: true, create: true, update: true },
    phones:    { read: true, create: true, update: true },
    'crm-kanban':   { read: true, create: true, update: true },
    'crm-payments': { read: true, create: true },
  },
  client: {
    leads: { create: true },
  },
};

export const DEFAULT_NAV_ORDER: Record<string, string[]> = {
  admin:          ['dashboard','listings','leads','users','news','phones','seo','districts','vb-knowledge','marketing','market-import','settings','crm-kanban','crm-gamification','crm-checks','crm-payments'],
  director:       ['dashboard','listings','leads','news','phones','users','marketing','vb-knowledge','crm-kanban','crm-gamification','crm-checks','crm-payments'],
  manager:        ['dashboard','listings','leads','news','phones','marketing','crm-kanban','crm-gamification','crm-checks','crm-payments'],
  editor:         ['dashboard','listings','leads','news','phones','pages','settings','seo','districts','vb-knowledge','marketing','market-import'],
  broker:         ['dashboard','listings','leads','crm-gamification','crm-checks'],
  office_manager: ['dashboard','listings','leads','phones','crm-kanban','crm-payments'],
};

export const NAV_SECTION_META: Record<string, { label: string; icon: string; group: string }> = {
  dashboard:        { label: 'Дашборд',          icon: 'LayoutDashboard', group: 'Основное' },
  listings:         { label: 'Объекты',           icon: 'Building2',       group: 'Основное' },
  leads:            { label: 'Заявки',            icon: 'Inbox',           group: 'Основное' },
  users:            { label: 'Пользователи',      icon: 'Users',           group: 'Основное' },
  news:             { label: 'Новости',           icon: 'Newspaper',       group: 'Основное' },
  phones:           { label: 'Телефонная база',   icon: 'Phone',           group: 'Основное' },
  seo:              { label: 'SEO',               icon: 'TrendingUp',      group: 'Контент' },
  districts:        { label: 'Районы',            icon: 'MapPin',          group: 'Контент' },
  'vb-knowledge':   { label: 'База знаний ВБ',   icon: 'Brain',           group: 'Контент' },
  marketing:        { label: 'Маркетолог',        icon: 'Megaphone',       group: 'Контент' },
  'market-import':  { label: 'Импорт рынка',     icon: 'Upload',          group: 'Контент' },
  settings:         { label: 'Настройки',         icon: 'Settings',        group: 'Контент' },
  pages:            { label: 'Страницы',          icon: 'FileText',        group: 'Контент' },
  'crm-kanban':     { label: 'Воронка сделок',   icon: 'KanbanSquare',    group: 'CRM' },
  'crm-gamification':{ label: 'Рейтинг команды', icon: 'Trophy',          group: 'CRM' },
  'crm-checks':     { label: 'Проверки',          icon: 'ShieldCheck',     group: 'CRM' },
  'crm-payments':   { label: 'Платежи',           icon: 'CreditCard',      group: 'CRM' },
};
