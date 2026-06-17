import Icon from '@/components/ui/icon';
import { Role } from '@/lib/adminApi';
import {
  Op, AllPerms,
  ROLES, SECTIONS,
  OP_LABELS, OP_ICONS, OP_COLORS,
} from './rolesAdminTypes';

interface Props {
  perms: AllPerms;
  toggle: (role: Role, section: string, op: Op) => void;
  toggleAll: (role: Role, section: string, ops: Op[]) => void;
  countPerms: (role: Role) => number;
}

export default function RolesMatrixView({ perms, toggle, toggleAll, countPerms }: Props) {
  const groups = [...new Set(SECTIONS.map(s => s.group))];

  return (
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
  );
}
