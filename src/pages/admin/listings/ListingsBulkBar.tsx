import Icon from '@/components/ui/icon';

const BULK_OPS = [
  { op: 'archive', label: 'Архивировать', icon: 'Archive', confirm: true },
  { op: 'activate', label: 'Сделать активными', icon: 'CheckCircle', confirm: true },
  { op: 'set_hot', label: 'Горячее', icon: 'Flame', value: true },
  { op: 'set_hot_off', label: 'Убрать горячее', icon: 'FlameOff', value: false, realOp: 'set_hot' },
  { op: 'set_new', label: 'Новинка', icon: 'Sparkles', value: true },
  { op: 'set_new_off', label: 'Убрать новинку', icon: 'X', value: false, realOp: 'set_new' },
];

interface Props {
  selected: Set<number>;
  onDeselect: () => void;
  onBulk: (op: string, value?: unknown) => void;
  onBulkDelete: () => void;
  bulkLoading: boolean;
  isAdmin: boolean;
}

export default function ListingsBulkBar({
  selected, onDeselect, onBulk, onBulkDelete, bulkLoading, isAdmin,
}: Props) {
  if (selected.size === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-brand-blue/5 border border-brand-blue/20 rounded-xl">
      <span className="text-sm font-semibold text-brand-blue">
        Выбрано: {selected.size}
      </span>
      <div className="flex flex-wrap gap-2 ml-2">
        {BULK_OPS.map(op => (
          <button
            key={op.op}
            disabled={bulkLoading}
            onClick={() => {
              const realOp = (op as { realOp?: string }).realOp || op.op;
              const doIt = () => onBulk(realOp, 'value' in op ? op.value : undefined);
              if (op.confirm) {
                if (confirm(`${op.label} ${selected.size} объект(ов)?`)) doIt();
              } else {
                doIt();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-muted disabled:opacity-50"
          >
            <Icon name={op.icon} size={13} />
            {op.label}
          </button>
        ))}
        {isAdmin && (
          <button
            disabled={bulkLoading}
            onClick={onBulkDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <Icon name="Trash2" size={13} />
            Удалить насовсем
          </button>
        )}
        <button onClick={onDeselect}
          className="text-xs text-muted-foreground hover:text-foreground px-2">
          Снять выбор
        </button>
      </div>
    </div>
  );
}
