import Icon from '@/components/ui/icon';
import { Lead, STATUSES } from './leadsTypes';

interface Props {
  leads: Lead[];
  filter: string;
  setFilter: (f: string) => void;
  onAdd: () => void;
}

export default function LeadsFilterBar({ leads, filter, setFilter, onAdd }: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center justify-between">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-lg ${filter === 'all' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'}`}>
          Все ({leads.length})
        </button>
        {STATUSES.map(s => (
          <button key={s[0]} onClick={() => setFilter(s[0])}
            className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
              filter === s[0] ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
            }`}>
            <span className={`w-2 h-2 rounded-full ${s[2]}`} />
            {s[1]} ({leads.filter(l => l.status === s[0]).length})
          </button>
        ))}
        <button onClick={() => setFilter('network')}
          className={`text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${
            filter === 'network' ? 'bg-brand-blue text-white' : 'bg-white shadow-sm hover:bg-muted'
          }`}>
          <Icon name="Network" size={12} />
          Сетевые ({leads.filter(l => l.is_network_tenant).length})
        </button>
      </div>
      <button onClick={onAdd}
        className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
        <Icon name="Plus" size={14} /> Добавить лид
      </button>
    </div>
  );
}
