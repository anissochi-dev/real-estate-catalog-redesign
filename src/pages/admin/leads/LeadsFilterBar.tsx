import Icon from '@/components/ui/icon';
import { Lead, STATUSES } from './leadsTypes';

interface Props {
  leads: Lead[];
  filter: string;
  setFilter: (f: string) => void;
  onAdd: () => void;
  search: string;
  setSearch: (v: string) => void;
}

export default function LeadsFilterBar({ leads, filter, setFilter, onAdd, search, setSearch }: Props) {
  return (
    <div className="space-y-2">
      {/* Строка 1: фильтры + кнопка */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilter('all')}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'}`}>
            Все ({leads.length})
          </button>
          {STATUSES.map(s => {
            const cnt = leads.filter(l => l.status === s[0]).length;
            if (cnt === 0) return null;
            return (
              <button key={s[0]} onClick={() => setFilter(s[0])}
                className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-medium transition-colors ${
                  filter === s[0] ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
                }`}>
                <span className={`w-2 h-2 rounded-full ${s[2]}`} />
                {s[1]} ({cnt})
              </button>
            );
          })}
          {leads.filter(l => l.is_network_tenant).length > 0 && (
            <button onClick={() => setFilter('network')}
              className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 font-medium transition-colors ${
                filter === 'network' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
              }`}>
              <Icon name="Network" size={12} />
              Сетевые ({leads.filter(l => l.is_network_tenant).length})
            </button>
          )}
        </div>
        <button onClick={onAdd}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 shrink-0">
          <Icon name="Plus" size={14} /> Добавить
        </button>
      </div>

      {/* Строка 2: поиск */}
      <div className="relative">
        <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по №, имени, телефону, сообщению..."
          className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="X" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}