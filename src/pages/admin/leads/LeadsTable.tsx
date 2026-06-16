import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Lead, STATUSES, SOURCE_LABELS, LEAD_TYPES } from './leadsTypes';
import { formatPhone } from '@/lib/phone';

interface Props {
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onDelete?: (id: number) => void;
}

type SortKey = 'created_at' | 'name' | 'status' | 'budget' | 'source';

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

export default function LeadsTable({ leads, onOpen, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...leads];
    arr.sort((a, b) => {
      const va = (a[sortKey] ?? '') as string | number;
      const vb = (b[sortKey] ?? '') as string | number;
      if (va === vb) return 0;
      const dir = sortDir === 'asc' ? 1 : -1;
      return va > vb ? dir : -dir;
    });
    return arr;
  }, [leads, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortHeader = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground ${className}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sortKey === k && <Icon name={sortDir === 'asc' ? 'ChevronUp' : 'ChevronDown'} size={12} />}
      </button>
    </th>
  );

  const statusOf = (s: string) => STATUSES.find(x => x[0] === s);
  const typeOf = (t: string | null) => LEAD_TYPES.find(x => x[0] === t);

  return (
    <>
    {/* ── Мобильный вид (карточки) ── */}
    <div className="sm:hidden bg-white rounded-2xl shadow-sm divide-y divide-border">
      {sorted.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <Icon name="Inbox" size={28} className="mx-auto mb-2 opacity-40" />
          Нет заявок
        </div>
      )}
      {sorted.map(l => {
        const st = statusOf(l.status);
        const tp = typeOf(l.lead_type);
        return (
          <div key={l.id} onClick={() => onOpen(l)}
            className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition">
            {/* Строка 1: дата + статус */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</span>
              <div className="flex items-center gap-1.5">
                {tp && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tp[2]}`}>{tp[1]}</span>}
                {st && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <span className={`w-2 h-2 rounded-full ${st[2]}`} />
                    {st[1]}
                  </span>
                )}
              </div>
            </div>
            {/* Строка 2: имя + телефон */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{l.name || '—'}</div>
                {l.company && <div className="text-xs text-purple-700">{l.company}</div>}
              </div>
              <div className="text-right shrink-0">
                <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()}
                   className={`text-sm font-mono font-semibold hover:underline ${l.phone_hidden ? 'text-muted-foreground' : 'text-brand-blue'}`}>
                  {l.phone ? formatPhone(l.phone) : '—'}
                </a>
                {l.phone_hidden && <Icon name="EyeOff" size={11} className="text-amber-500 inline ml-1" />}
                {l.email && <div className="text-[11px] text-muted-foreground">{l.email}</div>}
              </div>
            </div>
            {/* Строка 3: источник + бюджет + бейджи */}
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <div className="flex items-center gap-1 flex-wrap">
                {l.is_network_tenant && (
                  <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    <Icon name="Network" size={10} /> Сетевик
                  </span>
                )}
                {l.broker_id && (
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    <Icon name="UserCheck" size={10} /> Брокер
                  </span>
                )}
                {l.source === 'ai-chat' ? (
                  <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                    <Icon name="Bot" size={10} /> ИИ-чат
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{SOURCE_LABELS[l.source] || l.source || '—'}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {l.budget != null && l.budget > 0 && (
                  <span className="text-xs font-semibold">{l.budget.toLocaleString('ru')} ₽</span>
                )}
                {onDelete && (
                  <button onClick={e => { e.stopPropagation(); onDelete(l.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Удалить">
                    <Icon name="Trash2" size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* ── Десктопный вид (таблица) ── */}
    <div className="hidden sm:block bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <SortHeader k="created_at" label="Дата" />
              <SortHeader k="name" label="Клиент" />
              <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Телефон</th>
              <SortHeader k="source" label="Источник" />
              <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Тип</th>
              <SortHeader k="status" label="Статус" />
              <SortHeader k="budget" label="Бюджет" className="text-right" />
              <th className="px-3 py-2.5 text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground w-20">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted-foreground">
                  <Icon name="Inbox" size={28} className="mx-auto mb-2 opacity-40" />
                  Нет заявок
                </td>
              </tr>
            )}
            {sorted.map(l => {
              const st = statusOf(l.status);
              const tp = typeOf(l.lead_type);
              return (
                <tr key={l.id} className="border-b border-border/60 hover:bg-muted/20 transition cursor-pointer"
                    onClick={() => onOpen(l)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {fmtDate(l.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{l.name || '—'}</div>
                    {l.company && <div className="text-xs text-purple-700">{l.company}</div>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()}
                         className={`text-sm font-mono hover:underline ${l.phone_hidden ? 'text-muted-foreground' : 'text-brand-blue'}`}>
                        {l.phone ? formatPhone(l.phone) : '—'}
                      </a>
                      {l.phone_hidden && (
                        <span title="Телефон скрыт: заявка брокера. Видят только админ, директор и сам брокер.">
                          <Icon name="EyeOff" size={12} className="text-amber-500" />
                        </span>
                      )}
                    </div>
                    {l.email && <div className="text-xs text-muted-foreground">{l.email}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {l.is_network_tenant && (
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-semibold mr-1">
                        <Icon name="Network" size={10} /> Сетевик
                      </span>
                    )}
                    {l.broker_id && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-semibold mr-1">
                        <Icon name="UserCheck" size={10} /> Брокер
                      </span>
                    )}
                    {l.source === 'ai-chat' ? (
                      <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5">
                        <Icon name="Bot" size={10} /> ИИ-чат
                      </span>
                    ) : (
                      <div className="text-muted-foreground mt-0.5">
                        {SOURCE_LABELS[l.source] || l.source || '—'}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {tp && (
                      <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${tp[2]}`}>
                        {tp[1]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {st && (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className={`w-2 h-2 rounded-full ${st[2]}`} />
                        {st[1]}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-xs">
                    {l.budget != null && l.budget > 0
                      ? <span className="font-semibold">{l.budget.toLocaleString('ru')} ₽</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onOpen(l); }}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Открыть">
                        <Icon name="Eye" size={14} />
                      </button>
                      {onDelete && (
                        <button onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Удалить">
                          <Icon name="Trash2" size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}