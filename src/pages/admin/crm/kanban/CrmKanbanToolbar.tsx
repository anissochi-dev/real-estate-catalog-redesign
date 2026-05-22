import Icon from '@/components/ui/icon';

export type StatusFilter = 'all' | 'active' | 'closed' | 'overdue';
export type SortKey = 'updated' | 'created' | 'amount' | 'title';

interface Props {
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  sortKey: SortKey;
  setSortKey: (v: SortKey) => void;
  dealsCount: number;
}

export default function CrmKanbanToolbar({
  statusFilter, setStatusFilter, search, setSearch, sortKey, setSortKey, dealsCount,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5">
        {([
          { key: 'all', label: 'Все' },
          { key: 'active', label: 'Активные' },
          { key: 'closed', label: 'Закрытые' },
          { key: 'overdue', label: 'Просроченные' },
        ] as { key: StatusFilter; label: string }[]).map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setStatusFilter(opt.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              statusFilter === opt.key
                ? 'bg-white text-brand-blue shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по сделке, собственнику, объекту"
          className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-72 max-w-full"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Сортировка:</span>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="px-2.5 py-1.5 border rounded-lg text-xs bg-white"
        >
          <option value="updated">По обновлению</option>
          <option value="created">По дате создания</option>
          <option value="amount">По сумме</option>
          <option value="title">По названию</option>
        </select>
      </div>

      <div className="ml-auto text-xs text-muted-foreground">
        Найдено: <b className="text-foreground">{dealsCount}</b>
      </div>
    </div>
  );
}
