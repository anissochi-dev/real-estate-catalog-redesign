interface Props {
  filterStatus: string;
  filterPlatform: string;
  total: number;
  onStatusChange: (s: string) => void;
  onPlatformChange: (p: string) => void;
}

export default function QueueFilters({
  filterStatus,
  filterPlatform,
  total,
  onStatusChange,
  onPlatformChange,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {[
            { id: 'pending',          label: 'Ожидают' },
            { id: 'approved_lead',    label: 'В заявки' },
            { id: 'approved_listing', label: 'В объекты' },
            { id: 'rejected',         label: 'Отклонены' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => onStatusChange(s.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filterStatus === s.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-border text-foreground/70'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {['', 'vk', 'ok', 'telegram'].map(p => (
            <button
              key={p}
              onClick={() => onPlatformChange(p)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                filterPlatform === p ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-border text-foreground/70'
              }`}
            >
              {p === '' ? 'Все' : p === 'vk' ? 'VK' : p === 'ok' ? 'OK' : 'TG'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Найдено: {total} постов
      </p>
    </>
  );
}
