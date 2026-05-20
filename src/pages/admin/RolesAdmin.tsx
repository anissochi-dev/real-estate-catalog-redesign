import { useEffect, useState } from 'react';
import { adminApi, Role } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

type Op = 'read' | 'create' | 'update' | 'delete';

interface SectionDef {
  id: string;
  label: string;
  group: string;
  ops: Op[];
}

interface RolePerms {
  [section: string]: {
    [op in Op]?: boolean;
  };
}

interface AllPerms {
  [role: string]: RolePerms;
}

const SECTIONS: SectionDef[] = [
  { id: 'dashboard', label: 'Дашборд', group: 'Основное', ops: ['read'] },
  { id: 'listings', label: 'Объекты', group: 'Основное', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'leads', label: 'Лиды', group: 'Основное', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'pages', label: 'Страницы', group: 'Основное', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'settings', label: 'Настройки', group: 'Основное', ops: ['read', 'update'] },
  { id: 'phones', label: 'Телефонная база', group: 'Основное', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'users', label: 'Пользователи', group: 'Основное', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'crm-kanban', label: 'Воронка сделок', group: 'CRM', ops: ['read', 'create', 'update', 'delete'] },
  { id: 'crm-gamification', label: 'Рейтинг команды', group: 'CRM', ops: ['read'] },
  { id: 'crm-checks', label: 'Проверки', group: 'CRM', ops: ['read', 'create'] },
  { id: 'crm-payments', label: 'Платежи', group: 'CRM', ops: ['read', 'create', 'update'] },
];

const ROLES: { id: Role; label: string; color: string }[] = [
  { id: 'director', label: 'Директор', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'manager', label: 'Менеджер', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'editor', label: 'Редактор', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  { id: 'broker', label: 'Брокер', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'office_manager', label: 'Офис-менеджер', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'client', label: 'Клиент', color: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const OP_LABELS: Record<Op, string> = {
  read: 'Просмотр',
  create: 'Создание',
  update: 'Редактиров.',
  delete: 'Удаление',
};

const OP_ICONS: Record<Op, string> = {
  read: 'Eye',
  create: 'Plus',
  update: 'Pencil',
  delete: 'Trash2',
};

const DEFAULT_PERMS: AllPerms = {
  director: {
    dashboard: { read: true },
    listings: { read: true, create: true, update: true, delete: true },
    leads: { read: true, create: true, update: true, delete: true },
    pages: { read: true, create: true, update: true },
    settings: { read: true, update: true },
    phones: { read: true, create: true, update: true, delete: true },
    'crm-kanban': { read: true, create: true, update: true, delete: true },
    'crm-gamification': { read: true },
    'crm-checks': { read: true, create: true },
    'crm-payments': { read: true, create: true, update: true },
  },
  manager: {
    dashboard: { read: true },
    listings: { read: true, create: true, update: true, delete: true },
    leads: { read: true, create: true, update: true, delete: true },
    phones: { read: true, create: true, update: true },
    'crm-kanban': { read: true, create: true, update: true },
    'crm-gamification': { read: true },
    'crm-checks': { read: true },
    'crm-payments': { read: true },
  },
  editor: {
    dashboard: { read: true },
    listings: { read: true, create: true, update: true },
    leads: { read: true },
    pages: { read: true, create: true, update: true },
    settings: { read: true, update: true },
    phones: { read: true, create: true, update: true },
  },
  broker: {
    dashboard: { read: true },
    listings: { read: true, create: true, update: true },
    leads: { read: true, create: true },
    phones: { read: true, create: true },
    'crm-kanban': { read: true, create: true, update: true },
    'crm-gamification': { read: true },
    'crm-checks': { read: true },
  },
  office_manager: {
    dashboard: { read: true },
    listings: { read: true },
    leads: { read: true, create: true, update: true },
    phones: { read: true, create: true, update: true },
    'crm-kanban': { read: true, create: true, update: true },
    'crm-payments': { read: true, create: true },
  },
  client: {
    leads: { create: true },
  },
};

export default function RolesAdmin() {
  const [perms, setPerms] = useState<AllPerms>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<Role>('manager');

  useEffect(() => {
    adminApi.getRolePermissions()
      .then(d => {
        if (d.permissions && Object.keys(d.permissions).length > 0) {
          setPerms(d.permissions as AllPerms);
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
        [section]: {
          ...(prev[role]?.[section] || {}),
          [op]: !prev[role]?.[section]?.[op],
        },
      },
    }));
  };

  const toggleAll = (role: Role, section: string, ops: Op[]) => {
    const allOn = ops.every(op => perms[role]?.[section]?.[op]);
    setPerms(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [section]: Object.fromEntries(ops.map(op => [op, !allOn])),
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateRolePermissions(perms as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setPerms(DEFAULT_PERMS);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Загрузка...</div>;

  const roleInfo = ROLES.find(r => r.id === activeRole)!;
  const groups = [...new Set(SECTIONS.map(s => s.group))];

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Редактор ролей</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Настройте доступы к разделам для каждой роли</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2"
          >
            <Icon name="RotateCcw" size={14} />
            Сбросить
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 transition-colors flex items-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : saved ? (
              <Icon name="Check" size={14} />
            ) : (
              <Icon name="Save" size={14} />
            )}
            {saved ? 'Сохранено!' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Вкладки ролей */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map(r => (
          <button
            key={r.id}
            onClick={() => setActiveRole(r.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              activeRole === r.id
                ? r.color + ' shadow-sm'
                : 'border-border text-muted-foreground hover:border-brand-blue hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Заметка про admin */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-sm text-violet-700 flex items-center gap-2">
        <Icon name="ShieldCheck" size={16} />
        <span>Роль <strong>Администратор</strong> всегда имеет полный доступ ко всем разделам и не может быть ограничена.</span>
      </div>

      {/* Матрица прав */}
      {groups.map(group => {
        const sections = SECTIONS.filter(s => s.group === group);
        return (
          <div key={group} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-muted/50 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group}</span>
            </div>
            <div className="divide-y divide-border">
              {sections.map(section => {
                const allOn = section.ops.every(op => perms[activeRole]?.[section.id]?.[op]);
                const someOn = section.ops.some(op => perms[activeRole]?.[section.id]?.[op]);
                return (
                  <div key={section.id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap">
                    {/* Чекбокс «всё» */}
                    <button
                      onClick={() => toggleAll(activeRole, section.id, section.ops)}
                      className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
                        allOn
                          ? 'bg-brand-blue border-brand-blue text-white'
                          : someOn
                          ? 'bg-brand-blue/30 border-brand-blue/50'
                          : 'border-border'
                      }`}
                    >
                      {allOn && <Icon name="Check" size={11} />}
                      {someOn && !allOn && <span className="w-2 h-0.5 bg-brand-blue/60 rounded" />}
                    </button>

                    {/* Название раздела */}
                    <span className="text-sm font-medium text-foreground w-36 flex-shrink-0">{section.label}</span>

                    {/* Операции */}
                    <div className="flex flex-wrap gap-2 ml-auto">
                      {section.ops.map(op => {
                        const on = !!(perms[activeRole]?.[section.id]?.[op]);
                        return (
                          <button
                            key={op}
                            onClick={() => toggle(activeRole, section.id, op)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              on
                                ? 'bg-brand-blue text-white border-brand-blue shadow-sm'
                                : 'border-border text-muted-foreground hover:border-brand-blue/50 hover:text-foreground'
                            }`}
                          >
                            <Icon name={OP_ICONS[op]} size={11} />
                            {OP_LABELS[op]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Легенда */}
      <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground mb-2">Как это работает</div>
        <div>— Изменения применяются сразу после нажатия «Сохранить»</div>
        <div>— Если у роли нет доступа к разделу, пункт меню скрывается автоматически</div>
        <div>— Сброс возвращает стандартные права без изменения БД (нужно сохранить)</div>
      </div>
    </div>
  );
}
