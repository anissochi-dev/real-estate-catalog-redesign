import Icon from '@/components/ui/icon';
import { Lead, STATUSES, LEAD_TYPES, SOURCE_LABELS } from './leadsTypes';

interface Props {
  filtered: Lead[];
  active: Lead | null;
  onOpen: (l: Lead) => void;
}

export default function LeadsList({ filtered, active, onOpen }: Props) {
  const statusOf = (s: string) => STATUSES.find(x => x[0] === s);
  const fmtCreated = (s: string) =>
    new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="max-h-[70vh] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">Нет лидов</div>
        )}
        {filtered.map(l => {
          const st = statusOf(l.status);
          const lt = LEAD_TYPES.find(x => x[0] === (l.lead_type || 'view'));
          return (
            <button key={l.id} onClick={() => onOpen(l)}
              className={`w-full text-left px-4 py-3 border-b border-border border-l-4 hover:bg-muted/40 transition ${
                st?.[3] || ''
              } ${active?.id === l.id ? 'bg-brand-blue/5' : ''}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="font-semibold text-sm truncate">{l.name}</div>
                <div className="flex gap-1 shrink-0">
                  {lt && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${lt[2]}`}>{lt[1]}</span>}
                  <span className={`text-[10px] text-white px-1.5 py-0.5 rounded ${st?.[2] || 'bg-muted'}`}>
                    {st?.[1] || l.status}
                  </span>
                </div>
              </div>
              <div className="text-xs text-brand-blue font-mono mt-0.5">{l.phone}</div>
              {l.message && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{l.message}</div>
              )}
              <div className="flex items-center justify-between mt-1.5 gap-2">
                <div className="flex items-center gap-1.5">
                  {l.object_url && (
                    <span className="text-[10px] text-brand-blue flex items-center gap-0.5">
                      <Icon name="Link" size={9} />
                      {SOURCE_LABELS[l.source] || l.source || 'Источник'}
                    </span>
                  )}
                  {l.is_network_tenant && (
                    <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Сетевой</span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{fmtCreated(l.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
