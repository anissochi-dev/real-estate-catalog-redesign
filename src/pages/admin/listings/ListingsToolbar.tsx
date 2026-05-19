import Icon from '@/components/ui/icon';
import { CATS } from './types';
import { StatusFilter, clearDraft } from './useListingsState';

interface Props {
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  setSelected: (s: Set<number>) => void;
  search: string;
  setSearch: (v: string) => void;
  catFilter: string;
  setCatFilter: (v: string) => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
  onAdd: () => void;
  activeCount: number;
  archivedCount: number;
  totalCount: number;
  filteredCount: number;
}

export default function ListingsToolbar({
  statusFilter, setStatusFilter, setSelected,
  search, setSearch, catFilter, setCatFilter,
  hasDraft, setHasDraft, onAdd,
  activeCount, archivedCount, totalCount, filteredCount,
}: Props) {
  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ['active', `Активные (${activeCount})`, 'CheckCircle'],
            ['archived', `Архив (${archivedCount})`, 'Archive'],
            ['all', `Все (${totalCount})`, 'List'],
          ] as [StatusFilter, string, string][]).map(([v, l, ic]) => (
            <button key={v} onClick={() => { setStatusFilter(v); setSelected(new Set()); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${statusFilter === v ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
              <Icon name={ic} size={14} />
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg font-semibold inline-flex items-center gap-1">
                <Icon name="FileEdit" size={12} /> Черновик сохранён
              </span>
              <button
                onClick={() => { clearDraft(); setHasDraft(false); }}
                className="text-xs text-muted-foreground hover:text-red-600"
                title="Удалить черновик"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          )}
          <button onClick={onAdd}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Icon name="Plus" size={16} /> {hasDraft ? 'Продолжить черновик' : 'Добавить'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-border rounded-xl text-sm"
            placeholder="Поиск по названию, адресу, телефону, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-border rounded-xl px-3 py-2 text-sm"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">Все категории</option>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="text-xs text-muted-foreground">
        Показано: {filteredCount} из {totalCount}
      </div>
    </>
  );
}
