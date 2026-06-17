import { useEffect, useState } from 'react';
import { adminApi, Role } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

type Op = 'read' | 'create' | 'update' | 'delete';
type ViewMode = 'role' | 'matrix';

interface SectionDef {
  id: string;
  label: string;
  group: string;
  ops: Op[];
  icon: string;
}

interface RolePerms {
  [section: string]: { [op in Op]?: boolean };
}

interface AllPerms {
  [role: string]: RolePerms;
}

// Полный список разделов — соответствует NAV в AdminLayout
const SECTIONS: SectionDef[] = [
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

const ROLES: { id: Role; label: string; color: string; bg: string; dot: string }[] = [
  { id: 'director',       label: 'Директор',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500' },
  { id: 'manager',        label: 'Менеджер',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'editor',         label: 'Редактор',      color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200',      dot: 'bg-sky-500' },
  { id: 'broker',         label: 'Брокер',        color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-500' },
  { id: 'office_manager', label: 'Офис-менеджер', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { id: 'client',         label: 'Клиент',        color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200',  dot: 'bg-slate-400' },
];

const OP_LABELS: Record<Op, string> = { read: 'Просмотр', create: 'Создание', update: 'Редактир.', delete: 'Удаление' };
const OP_ICONS: Record<Op, string>  = { read: 'Eye', create: 'Plus', update: 'Pencil', delete: 'Trash2' };
const OP_COLORS: Record<Op, string> = {
  read:   'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100',
  create: 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
  update: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100',
  delete: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100',
};
const OP_COLORS_OFF = 'text-muted-foreground bg-muted/40 border-border hover:bg-muted';

const DEFAULT_PERMS: AllPerms = {
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

function PermBadge({ on, op, onClick }: { on: boolean; op: Op; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={OP_LABELS[op]}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all ${on ? OP_COLORS[op] : OP_COLORS_OFF}`}
    >
      <Icon name={OP_ICONS[op]} size={11} />
      <span className="hidden sm:inline">{OP_LABELS[op]}</span>
    </button>
  );
}

export default function RolesAdmin() {
  const [perms, setPerms] = useState<AllPerms>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<Role>('director');
  const [viewMode, setViewMode] = useState<ViewMode>('role');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    adminApi.getRolePermissions()
      .then(d => {
        if (d.permissions && Object.keys(d.permissions).length > 0) {
          // Мержим с DEFAULT_PERMS: добавляем недостающие секции, не трогаем существующие
          const merged: AllPerms = {};
          for (const role of Object.keys(DEFAULT_PERMS) as Role[]) {
            const dbRole = (d.permissions as AllPerms)[role] || {};
            const defRole = DEFAULT_PERMS[role] || {};
            merged[role] = { ...defRole, ...dbRole };
          }
          setPerms(merged);
          // Если БД была неполной — сохраняем актуальные права
          const dbKeys = Object.keys(d.permissions as AllPerms);
          const needsUpdate = dbKeys.some(role => {
            const dbRole = (d.permissions as AllPerms)[role] || {};
            const defRole = DEFAULT_PERMS[role as Role] || {};
            return Object.keys(defRole).some(sec => !(sec in dbRole));
          });
          if (needsUpdate) {
            adminApi.updateRolePermissions(merged as Record<string, unknown>).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (role: Role, section: string, op: Op) => {
    setPerms(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [section]: { ...(prev[role]?.[section] || {}), [op]: !prev[role]?.[section]?.[op] },
      },
    }));
    setHasChanges(true);
  };

  const toggleAll = (role: Role, section: string, ops: Op[]) => {
    const allOn = ops.every(op => perms[role]?.[section]?.[op]);
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [section]: Object.fromEntries(ops.map(op => [op, !allOn])) },
    }));
    setHasChanges(true);
  };

  const copyRole = (from: Role, to: Role) => {
    if (!confirm(`Скопировать права «${ROLES.find(r => r.id === from)?.label}» в «${ROLES.find(r => r.id === to)?.label}»?`)) return;
    setPerms(prev => ({ ...prev, [to]: { ...prev[from] } }));
    setHasChanges(true);
  };

  const clearRole = (role: Role) => {
    if (!confirm(`Сбросить все права роли «${ROLES.find(r => r.id === role)?.label}»?`)) return;
    setPerms(prev => ({ ...prev, [role]: {} }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateRolePermissions(perms as Record<string, unknown>);
      setSaved(true);
      setHasChanges(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!confirm('Сбросить все права к значениям по умолчанию?')) return;
    setPerms(DEFAULT_PERMS);
    setHasChanges(true);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Icon name="Loader2" size={18} className="animate-spin" />
      Загрузка прав...
    </div>
  );

  const groups = [...new Set(SECTIONS.map(s => s.group))];
  const roleInfo = ROLES.find(r => r.id === activeRole)!;

  // Подсчёт активных прав для роли
  const countPerms = (role: Role) => {
    const rp = perms[role] || {};
    return Object.values(rp).reduce((acc, ops) => acc + Object.values(ops).filter(Boolean).length, 0);
  };

  return (
    <div className="space-y-5">

      {/* ── Шапка ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Редактор ролей и доступов</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Настройте права доступа к разделам для каждой роли. Администратор всегда имеет полный доступ.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Переключатель вида */}
          <div className="flex items-center bg-muted rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode('role')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${viewMode === 'role' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="User" size={13} /> По роли
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${viewMode === 'matrix' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="Grid3x3" size={13} /> Матрица
            </button>
          </div>
          <button
            onClick={reset}
            className="px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            <Icon name="RotateCcw" size={13} /> Сбросить
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
              hasChanges
                ? 'bg-brand-blue text-white hover:bg-brand-blue/90'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {saving ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              : saved ? <Icon name="Check" size={14} />
              : <Icon name="Save" size={14} />}
            {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* ── Заметка про admin ── */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 text-sm text-violet-700 flex items-center gap-2">
        <Icon name="ShieldCheck" size={15} />
        <span>Роль <strong>Администратор</strong> имеет полный доступ ко всем разделам и не редактируется здесь.</span>
      </div>

      {/* ══════════════════════════════════════════
          ВИД: по одной роли
      ══════════════════════════════════════════ */}
      {viewMode === 'role' && (
        <>
          {/* Выбор роли */}
          <div className="flex flex-wrap gap-2">
            {ROLES.map(r => {
              const cnt = countPerms(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => setActiveRole(r.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${
                    activeRole === r.id
                      ? r.bg + ' ' + r.color + ' shadow-sm'
                      : 'border-border text-muted-foreground hover:border-brand-blue hover:text-foreground bg-white'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                  {r.label}
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${activeRole === r.id ? 'bg-white/60' : 'bg-muted'}`}>
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Инструменты роли */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Быстрые действия:</span>
            <button
              onClick={() => {
                const allOn = SECTIONS.every(s => s.ops.every(op => perms[activeRole]?.[s.id]?.[op]));
                const next: RolePerms = {};
                SECTIONS.forEach(s => { next[s.id] = Object.fromEntries(s.ops.map(op => [op, !allOn])); });
                setPerms(prev => ({ ...prev, [activeRole]: next }));
                setHasChanges(true);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Включить всё / выключить всё
            </button>
            <button
              onClick={() => clearRole(activeRole)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
            >
              <Icon name="Trash2" size={11} /> Очистить роль
            </button>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-muted-foreground">Скопировать права из:</span>
              {ROLES.filter(r => r.id !== activeRole).map(r => (
                <button
                  key={r.id}
                  onClick={() => copyRole(r.id, activeRole)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${r.bg} ${r.color}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Матрица для одной роли */}
          <div className="space-y-3">
            {groups.map(group => {
              const sections = SECTIONS.filter(s => s.group === group);
              return (
                <div key={group} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</span>
                    <span className="text-xs text-muted-foreground">
                      ({sections.filter(s => s.ops.some(op => perms[activeRole]?.[s.id]?.[op])).length}/{sections.length} разделов)
                    </span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {sections.map(s => {
                      const hasAny = s.ops.some(op => perms[activeRole]?.[s.id]?.[op]);
                      return (
                        <div key={s.id} className={`px-4 py-3 flex items-center gap-3 transition-colors ${hasAny ? '' : 'opacity-60'}`}>
                          <button
                            onClick={() => toggleAll(activeRole, s.id, s.ops)}
                            className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 ${
                              s.ops.every(op => perms[activeRole]?.[s.id]?.[op])
                                ? 'bg-brand-blue border-brand-blue text-white'
                                : hasAny
                                ? 'bg-brand-blue/20 border-brand-blue/50'
                                : 'border-border'
                            }`}
                          >
                            {s.ops.every(op => perms[activeRole]?.[s.id]?.[op]) && <Icon name="Check" size={11} />}
                            {hasAny && !s.ops.every(op => perms[activeRole]?.[s.id]?.[op]) && <span className="w-2 h-0.5 bg-brand-blue rounded" />}
                          </button>
                          <Icon name={s.icon} size={15} className={hasAny ? 'text-brand-blue' : 'text-muted-foreground'} />
                          <span className={`text-sm font-medium flex-1 ${hasAny ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {s.label}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {s.ops.map(op => (
                              <PermBadge
                                key={op}
                                op={op}
                                on={!!perms[activeRole]?.[s.id]?.[op]}
                                onClick={() => toggle(activeRole, s.id, op)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          ВИД: матрица всех ролей сразу
      ══════════════════════════════════════════ */}
      {viewMode === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground w-48 sticky left-0 bg-muted/40 z-10">
                    Раздел
                  </th>
                  {ROLES.map(r => (
                    <th key={r.id} className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${r.bg} ${r.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                        {r.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(group => (
                  <>
                    <tr key={`group-${group}`} className="bg-muted/20">
                      <td colSpan={ROLES.length + 1} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {group}
                      </td>
                    </tr>
                    {SECTIONS.filter(s => s.group === group).map(s => (
                      <tr key={s.id} className="border-t border-border/50 hover:bg-muted/10">
                        <td className="px-4 py-2.5 sticky left-0 bg-white z-10">
                          <div className="flex items-center gap-2">
                            <Icon name={s.icon} size={13} className="text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium text-foreground">{s.label}</span>
                          </div>
                        </td>
                        {ROLES.map(r => {
                          const hasAny = s.ops.some(op => perms[r.id]?.[s.id]?.[op]);
                          const hasAll = s.ops.every(op => perms[r.id]?.[s.id]?.[op]);
                          return (
                            <td key={r.id} className="px-3 py-2 text-center">
                              <button
                                onClick={() => toggleAll(r.id, s.id, s.ops)}
                                title={`${r.label}: ${s.label}`}
                                className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center border-2 transition-all ${
                                  hasAll
                                    ? `border-transparent ${r.dot.replace('bg-', 'bg-')} text-white`
                                    : hasAny
                                    ? 'border-current bg-transparent'
                                    : 'border-border bg-muted/30 text-muted-foreground'
                                }`}
                                style={hasAll ? { backgroundColor: undefined } : {}}
                              >
                                {hasAll ? (
                                  <Icon name="Check" size={14} className="text-current" />
                                ) : hasAny ? (
                                  <span className="w-3 h-0.5 rounded bg-current" />
                                ) : (
                                  <Icon name="Minus" size={12} />
                                )}
                              </button>
                              {/* Детали по операциям */}
                              <div className="flex items-center justify-center gap-0.5 mt-1">
                                {s.ops.map(op => (
                                  <button
                                    key={op}
                                    onClick={() => toggle(r.id, s.id, op)}
                                    title={`${r.label}: ${s.label} — ${OP_LABELS[op]}`}
                                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                      perms[r.id]?.[s.id]?.[op]
                                        ? OP_COLORS[op].split(' ').slice(0, 2).join(' ')
                                        : 'bg-muted/50'
                                    }`}
                                  >
                                    <Icon name={OP_ICONS[op]} size={9} />
                                  </button>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/20">
                <tr>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-semibold sticky left-0 bg-muted/20">
                    Всего прав
                  </td>
                  {ROLES.map(r => (
                    <td key={r.id} className="px-3 py-2.5 text-center">
                      <span className={`text-sm font-bold ${r.color}`}>{countPerms(r.id)}</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Легенда */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="font-semibold">Легенда:</span>
            {(['read', 'create', 'update', 'delete'] as Op[]).map(op => (
              <span key={op} className="flex items-center gap-1">
                <span className={`w-4 h-4 rounded flex items-center justify-center ${OP_COLORS[op].split(' ').slice(0, 2).join(' ')}`}>
                  <Icon name={OP_ICONS[op]} size={9} />
                </span>
                {OP_LABELS[op]}
              </span>
            ))}
            <span className="flex items-center gap-1 ml-2">
              Клик по иконке — toggle операции. Клик по кружку — toggle всех операций раздела.
            </span>
          </div>
        </div>
      )}

      {/* Индикатор несохранённых изменений */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 bg-brand-blue text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 z-50 text-sm font-semibold">
          <Icon name="AlertCircle" size={16} />
          Есть несохранённые изменения
          <button onClick={save} disabled={saving} className="px-3 py-1 bg-white text-brand-blue rounded-lg text-xs font-bold hover:bg-white/90 transition-colors">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  );
}