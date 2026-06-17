import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { ALL_ROLES_NAV, NAV_SECTION_META } from './rolesAdminTypes';

interface Props {
  navOrder: Record<string, string[]>;
  setNavOrder: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  navRole: string;
  setNavRole: (r: string) => void;
  setHasChanges: (v: boolean) => void;
  resetNavOrder: () => void;
  moveNavItem: (role: string, from: number, to: number) => void;
}

export default function RolesNavView({
  navOrder, setNavOrder, navRole, setNavRole,
  setHasChanges, resetNavOrder, moveNavItem,
}: Props) {
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const onDragStart = (idx: number) => { dragItem.current = idx; };
  const onDragEnter = (idx: number) => { dragOver.current = idx; };
  const onDragEnd = (role: string) => {
    if (dragItem.current === null || dragOver.current === null) return;
    if (dragItem.current === dragOver.current) return;
    setNavOrder(prev => {
      const items = [...(prev[role] || [])];
      const [moved] = items.splice(dragItem.current!, 1);
      items.splice(dragOver.current!, 0, moved);
      dragItem.current = null;
      dragOver.current = null;
      return { ...prev, [role]: items };
    });
    setHasChanges(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Перетащите пункты меню или используйте стрелки ↑↓ чтобы изменить порядок отображения в боковом меню для каждой роли.
        </p>
        <button
          onClick={resetNavOrder}
          className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Icon name="RotateCcw" size={12} /> Сбросить порядок
        </button>
      </div>

      {/* Выбор роли */}
      <div className="flex flex-wrap gap-2">
        {ALL_ROLES_NAV.map(r => (
          <button
            key={r.id}
            onClick={() => setNavRole(r.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all flex items-center gap-2 ${
              navRole === r.id
                ? r.bg + ' ' + r.color + ' shadow-sm'
                : 'border-border text-muted-foreground hover:border-brand-blue bg-white'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${r.dot}`} />
            {r.label}
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/60 bg-opacity-60">
              {(navOrder[navRole] || []).length}
            </span>
          </button>
        ))}
      </div>

      {/* Список пунктов с drag-and-drop */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {ALL_ROLES_NAV.find(r => r.id === navRole)?.label} — порядок пунктов меню
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            Перетащите или используйте ↑↓
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {(navOrder[navRole] || []).map((sectionId, idx) => {
            const meta = NAV_SECTION_META[sectionId];
            if (!meta) return null;
            const isFirst = idx === 0;
            const isLast = idx === (navOrder[navRole] || []).length - 1;
            return (
              <div
                key={sectionId}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragEnter={() => onDragEnter(idx)}
                onDragEnd={() => onDragEnd(navRole)}
                onDragOver={e => e.preventDefault()}
                className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors cursor-grab active:cursor-grabbing select-none group"
              >
                {/* Иконка drag */}
                <Icon name="GripVertical" size={16} className="text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />

                {/* Номер */}
                <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>

                {/* Иконка и название */}
                <Icon name={meta.icon} size={15} className="text-brand-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{meta.group}</span>
                </div>

                {/* Кнопки ↑↓ */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveNavItem(navRole, idx, idx - 1)}
                    disabled={isFirst}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Переместить выше"
                  >
                    <Icon name="ChevronUp" size={14} />
                  </button>
                  <button
                    onClick={() => moveNavItem(navRole, idx, idx + 1)}
                    disabled={isLast}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Переместить ниже"
                  >
                    <Icon name="ChevronDown" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Подсказка */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground flex items-center gap-2">
          <Icon name="Info" size={13} />
          Изменения вступят в силу после сохранения и перезагрузки страницы
        </div>
      </div>
    </div>
  );
}
