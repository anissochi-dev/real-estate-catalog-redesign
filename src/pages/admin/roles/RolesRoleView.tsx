import Icon from '@/components/ui/icon';
import { Role } from '@/lib/adminApi';
import {
  Op, AllPerms, RolePerms,
  ROLES, SECTIONS,
  OP_LABELS, OP_ICONS, OP_COLORS, OP_COLORS_OFF,
} from './rolesAdminTypes';

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

interface Props {
  perms: AllPerms;
  activeRole: Role;
  setActiveRole: (r: Role) => void;
  toggle: (role: Role, section: string, op: Op) => void;
  toggleAll: (role: Role, section: string, ops: Op[]) => void;
  copyRole: (from: Role, to: Role) => void;
  clearRole: (role: Role) => void;
  countPerms: (role: Role) => number;
  setPerms: React.Dispatch<React.SetStateAction<AllPerms>>;
  setHasChanges: (v: boolean) => void;
}

export default function RolesRoleView({
  perms, activeRole, setActiveRole,
  toggle, toggleAll, copyRole, clearRole,
  countPerms, setPerms, setHasChanges,
}: Props) {
  const groups = [...new Set(SECTIONS.map(s => s.group))];

  return (
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
  );
}
