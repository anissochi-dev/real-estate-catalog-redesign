import { useEffect, useState } from 'react';
import { adminApi, Role } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import {
  ViewMode, AllPerms, Op,
  ROLES, DEFAULT_PERMS, DEFAULT_NAV_ORDER,
} from './roles/rolesAdminTypes';
import RolesRoleView from './roles/RolesRoleView';
import RolesMatrixView from './roles/RolesMatrixView';
import RolesNavView from './roles/RolesNavView';

export default function RolesAdmin() {
  const [perms, setPerms] = useState<AllPerms>(DEFAULT_PERMS);
  const [navOrder, setNavOrder] = useState<Record<string, string[]>>(DEFAULT_NAV_ORDER);
  const [navRole, setNavRole] = useState<string>('admin');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<Role>('director');
  const [viewMode, setViewMode] = useState<ViewMode>('role');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    Promise.all([
      adminApi.getRolePermissions(),
      adminApi.getNavOrder(),
    ]).then(([pd, sd]) => {
      // Права ролей
      if (pd.permissions && Object.keys(pd.permissions).length > 0) {
        const merged: AllPerms = {};
        for (const role of Object.keys(DEFAULT_PERMS) as Role[]) {
          const dbRole = (pd.permissions as AllPerms)[role] || {};
          const defRole = DEFAULT_PERMS[role] || {};
          merged[role] = { ...defRole, ...dbRole };
        }
        setPerms(merged);
        const needsUpdate = Object.keys(pd.permissions as AllPerms).some(role => {
          const dbRole = (pd.permissions as AllPerms)[role] || {};
          const defRole = DEFAULT_PERMS[role as Role] || {};
          return Object.keys(defRole).some(sec => !(sec in dbRole));
        });
        if (needsUpdate) {
          adminApi.updateRolePermissions(merged as Record<string, unknown>).catch(() => {});
        }
      }
      // Порядок меню
      if (sd.settings?.nav_order) {
        try {
          const parsed = typeof sd.settings.nav_order === 'string'
            ? JSON.parse(sd.settings.nav_order)
            : sd.settings.nav_order;
          if (parsed && typeof parsed === 'object') {
            setNavOrder({ ...DEFAULT_NAV_ORDER, ...parsed });
          }
        } catch { /* ignore */ }
      }
    }).catch(() => {}).finally(() => setLoading(false));
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

  const moveNavItem = (role: string, from: number, to: number) => {
    if (to < 0 || to >= (navOrder[role] || []).length) return;
    setNavOrder(prev => {
      const items = [...(prev[role] || [])];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...prev, [role]: items };
    });
    setHasChanges(true);
  };

  const resetNavOrder = () => {
    if (!confirm('Сбросить порядок меню к значениям по умолчанию?')) return;
    setNavOrder(DEFAULT_NAV_ORDER);
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        adminApi.updateRolePermissions(perms as Record<string, unknown>),
        adminApi.updateNavOrder(navOrder),
      ]);
      setSaved(true);
      setHasChanges(false);
      setTimeout(() => setSaved(false), 3000);
      try { localStorage.setItem('biznest_nav_order', JSON.stringify(navOrder)); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('admin:nav-order-updated'));
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

  const countPerms = (role: Role) => {
    const rp = perms[role] || {};
    return Object.values(rp).reduce((acc, ops) => acc + Object.values(ops).filter(Boolean).length, 0);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Icon name="Loader2" size={18} className="animate-spin" />
      Загрузка прав...
    </div>
  );

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
            <button
              onClick={() => setViewMode('nav')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${viewMode === 'nav' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name="Menu" size={13} /> Порядок меню
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

      {/* ══ ВИД: по одной роли ══ */}
      {viewMode === 'role' && (
        <RolesRoleView
          perms={perms}
          activeRole={activeRole}
          setActiveRole={setActiveRole}
          toggle={toggle}
          toggleAll={toggleAll}
          copyRole={copyRole}
          clearRole={clearRole}
          countPerms={countPerms}
          setPerms={setPerms}
          setHasChanges={setHasChanges}
        />
      )}

      {/* ══ ВИД: матрица всех ролей ══ */}
      {viewMode === 'matrix' && (
        <RolesMatrixView
          perms={perms}
          toggle={toggle}
          toggleAll={toggleAll}
          countPerms={countPerms}
        />
      )}

      {/* ══ ВИД: порядок меню ══ */}
      {viewMode === 'nav' && (
        <RolesNavView
          navOrder={navOrder}
          setNavOrder={setNavOrder}
          navRole={navRole}
          setNavRole={setNavRole}
          setHasChanges={setHasChanges}
          resetNavOrder={resetNavOrder}
          moveNavItem={moveNavItem}
        />
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