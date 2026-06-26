import { useMemo, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Lead, STATUSES, SOURCE_LABELS, PROPERTY_TYPES_LEAD, PROPERTY_CATEGORIES_LEAD } from './leadsTypes';
import { formatPhone } from '@/lib/phone';

interface Props {
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onDelete?: (id: number) => void;
  onStatusChange?: (id: number, status: string) => void;
  search?: string;
  currentUserId?: number;
  isBroker?: boolean;
}

const AVATAR_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDate(s: string) {
  const d = new Date(s);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${time}`;
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Новая',      cls: 'bg-orange-100 text-orange-700' },
  new:         { label: 'Новая',      cls: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'В работе',   cls: 'bg-blue-100 text-blue-700' },
  done:        { label: 'Выполнена',  cls: 'bg-green-100 text-green-700' },
  rejected:    { label: 'Отклонена', cls: 'bg-red-100 text-red-600' },
};

type SortKey = 'name' | 'date' | 'budget' | 'status';

export default function LeadsTable({ leads, onOpen, onDelete, onStatusChange, search = '', currentUserId, isBroker = false }: Props) {
  const [statusMenuId, setStatusMenuId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const canManageLead = (l: Lead) =>
    !isBroker || (l.broker_id != null && l.broker_id === currentUserId);

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const STATUS_ORDER: Record<string, number> = { pending: 0, new: 1, in_progress: 2, done: 3, rejected: 4 };
    return [...leads].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'ru');
      else if (sortKey === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortKey === 'budget') cmp = (a.budget ?? 0) - (b.budget ?? 0);
      else if (sortKey === 'status') cmp = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [leads, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="ml-1 inline-flex flex-col leading-none opacity-40">
      <span className={sortKey === col && sortDir === 'asc' ? 'opacity-100 text-brand-blue' : ''}>▲</span>
      <span className={sortKey === col && sortDir === 'desc' ? 'opacity-100 text-brand-blue' : ''}>▼</span>
    </span>
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm py-16 text-center text-muted-foreground">
        <Icon name="Inbox" size={32} className="mx-auto mb-3 opacity-30" />
        <div className="text-sm">Нет заявок</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 cursor-pointer hover:bg-muted/80 transition-colors whitespace-nowrap select-none" onClick={() => handleSort('name')}>
                Клиент <SortIcon col="name" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 whitespace-nowrap">Телефон</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 cursor-pointer hover:bg-muted/80 transition-colors whitespace-nowrap select-none" onClick={() => handleSort('date')}>
                Дата <SortIcon col="date" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 min-w-[240px]">Требования</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 cursor-pointer hover:bg-muted/80 transition-colors whitespace-nowrap select-none" onClick={() => handleSort('budget')}>
                Бюджет <SortIcon col="budget" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 cursor-pointer hover:bg-muted/80 transition-colors whitespace-nowrap select-none" onClick={() => handleSort('status')}>
                Статус <SortIcon col="status" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-foreground/70 whitespace-nowrap">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sorted.map(l => {
              const canManage = canManageLead(l);
              const st = STATUS_STYLE[l.status];
              const isExpanded = expandedIds.has(l.id);
              const msg = l.message || '';

              return (
                <tr
                  key={l.id}
                  onClick={() => onOpen(l)}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {/* Клиент */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ background: avatarColor(l.name) }}
                      >
                        {initials(l.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate max-w-[140px]">
                          {highlight(l.name, search)}
                        </div>
                        {l.company && (
                          <div className="text-[12px] text-muted-foreground truncate max-w-[140px]">{l.company}</div>
                        )}
                        {l.source && SOURCE_LABELS[l.source] && (
                          <div className="text-[11px] text-muted-foreground/60">{SOURCE_LABELS[l.source]}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Телефон */}
                  <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {canManage ? (
                      <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 text-foreground hover:text-brand-blue transition-colors text-[13px]">
                        <Icon name="Phone" size={12} className="text-muted-foreground" />
                        {l.phone ? formatPhone(l.phone) : '—'}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                        <Icon name="Lock" size={11} /> Скрыт
                      </span>
                    )}
                  </td>

                  {/* Дата */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Icon name="Clock" size={12} />
                      {fmtDate(l.created_at)}
                    </span>
                  </td>

                  {/* Требования */}
                  <td className="px-4 py-3 max-w-[300px]" onClick={e => e.stopPropagation()}>
                    {/* Бейджи: тип, категория, площадь, коммуникации */}
                    {(l.property_type || l.property_category || l.area_from || l.area_to || l.utilities) && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {l.property_type && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            {PROPERTY_TYPES_LEAD.find(t => t.value === l.property_type)?.label || l.property_type}
                          </span>
                        )}
                        {l.property_category && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                            {PROPERTY_CATEGORIES_LEAD.find(c => c.value === l.property_category)?.label || l.property_category}
                          </span>
                        )}
                        {(l.area_from || l.area_to) && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground/70 flex items-center gap-1">
                            <Icon name="Maximize" size={10} />
                            {l.area_from ? `от ${l.area_from}` : ''}{l.area_from && l.area_to ? ' ' : ''}{l.area_to ? `до ${l.area_to}` : ''} м²
                          </span>
                        )}
                        {l.utilities && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700" title={l.utilities}>
                            <Icon name="Zap" size={10} className="inline mr-0.5" />
                            {l.utilities.length > 25 ? l.utilities.slice(0, 25) + '…' : l.utilities}
                          </span>
                        )}
                      </div>
                    )}
                    {msg ? (
                      <div>
                        <p className={`text-[13px] text-foreground/80 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {highlight(msg, search)}
                        </p>
                        {msg.length > 100 && (
                          <button
                            className="text-[12px] text-brand-blue font-medium mt-1 hover:underline"
                            onClick={e => toggleExpand(l.id, e)}
                          >
                            {isExpanded ? 'Свернуть' : 'Развернуть'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground italic">Без описания</span>
                    )}
                  </td>

                  {/* Бюджет */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.budget != null && l.budget > 0 ? (
                      <span className="font-semibold text-foreground text-[13px]">
                        {l.budget.toLocaleString('ru')} ₽
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[12px]">—</span>
                    )}
                  </td>

                  {/* Статус */}
                  <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => canManage && onStatusChange && setStatusMenuId(statusMenuId === l.id ? null : l.id)}
                        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full transition-opacity ${st?.cls ?? 'bg-muted text-foreground'} ${canManage && onStatusChange ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                      >
                        {st?.label ?? l.status}
                        {canManage && onStatusChange && <Icon name="ChevronDown" size={11} />}
                      </button>
                      {statusMenuId === l.id && (
                        <div className="absolute left-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-50 py-1 min-w-[140px]">
                          {STATUSES.map(s => (
                            <button
                              key={s[0]}
                              onClick={() => { onStatusChange?.(l.id, s[0]); setStatusMenuId(null); }}
                              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors ${l.status === s[0] ? 'font-semibold text-brand-blue' : 'text-foreground'}`}
                            >
                              <span className={`w-2 h-2 rounded-full ${s[2]} shrink-0`} />
                              {s[1]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Действия */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpen(l)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Просмотр"
                      >
                        <Icon name="Eye" size={14} />
                      </button>
                      {onDelete && canManage && (
                        <button
                          onClick={() => onDelete(l.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="Удалить"
                        >
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
  );
}