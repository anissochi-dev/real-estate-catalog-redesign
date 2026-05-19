import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CRM_URL, adminApi } from '@/lib/adminApi';

type EventType = 'note' | 'event' | 'reminder';

interface CrmEvent {
  id: number;
  title: string;
  description?: string;
  event_type: EventType;
  starts_at: string;
  ends_at?: string;
  is_done: boolean;
  deal_id?: number;
  owner_id?: number;
  listing_id?: number;
  deal_title?: string;
  owner_name?: string;
  listing_title?: string;
  creator_name?: string;
  assigned_name?: string;
}

interface SearchItem {
  id: number;
  label: string;
  sub?: string;
}

const TYPE_META: Record<EventType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  note:     { label: 'Заметка',     icon: 'StickyNote',    color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-300' },
  event:    { label: 'Событие',     icon: 'CalendarCheck', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-300'   },
  reminder: { label: 'Напоминание', icon: 'BellRing',      color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-300' },
};

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const dow   = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < dow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

interface LinkField {
  deal_id: number | null;
  deal_label: string;
  owner_id: number | null;
  owner_label: string;
  listing_id: number | null;
  listing_label: string;
}

interface EventFormState {
  title: string;
  description: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
}

const EMPTY_FORM: EventFormState = {
  title: '', description: '', event_type: 'note', starts_at: '', ends_at: '',
};
const EMPTY_LINKS: LinkField = {
  deal_id: null, deal_label: '',
  owner_id: null, owner_label: '',
  listing_id: null, listing_label: '',
};

/* ── Компонент поиска с выпадашкой ── */
interface SearchDropdownProps {
  label: string;
  icon: string;
  colorClass: string;
  value: string;
  selectedId: number | null;
  onSelect: (id: number, label: string) => void;
  onClear: () => void;
  items: SearchItem[];
  loading: boolean;
  onSearch: (q: string) => void;
  placeholder: string;
}

function SearchDropdown({ label, icon, colorClass, value, selectedId, onSelect, onClear, items, loading, onSearch, placeholder }: SearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className={`text-[10px] font-semibold flex items-center gap-1 mb-1 ${colorClass}`}>
        <Icon name={icon} size={10} />{label}
      </label>
      {selectedId ? (
        <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colorClass} bg-white border-current/30`}>
          <span className="truncate">{value}</span>
          <button type="button" onClick={onClear} className="ml-1 shrink-0 hover:opacity-60">
            <Icon name="X" size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={value}
            onChange={e => { onSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="text-xs pr-7"
          />
          {loading && (
            <Icon name="Loader2" size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {open && items.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto">
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted transition text-xs"
                  onMouseDown={() => { onSelect(item.id, item.label); setOpen(false); }}
                >
                  <div className="font-medium truncate">{item.label}</div>
                  {item.sub && <div className="text-muted-foreground truncate">{item.sub}</div>}
                </button>
              ))}
            </div>
          )}
          {open && !loading && value.length >= 2 && items.length === 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg px-3 py-2 text-xs text-muted-foreground">
              Ничего не найдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Хук поиска сделок ── */
function useDealsSearch(token: string, q: string) {
  return useQuery<SearchItem[]>({
    queryKey: ['deals-search', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const r = await fetch(`${CRM_URL}/deals?search=${encodeURIComponent(q)}&limit=8`, {
        headers: { 'X-Auth-Token': token },
      });
      const data = await r.json();
      return (data.deals || data || []).map((d: { id: number; title: string; amount?: number }) => ({
        id: d.id,
        label: d.title,
        sub: d.amount ? `${Number(d.amount).toLocaleString('ru')} ₽` : undefined,
      }));
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

/* ── Хук поиска собственников ── */
function useOwnersSearch(token: string, q: string) {
  return useQuery<SearchItem[]>({
    queryKey: ['owners-search', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const r = await fetch(`${CRM_URL}/owners?search=${encodeURIComponent(q)}&limit=8`, {
        headers: { 'X-Auth-Token': token },
      });
      const data = await r.json();
      return (data.owners || []).map((o: { id: number; name: string; phone?: string }) => ({
        id: o.id,
        label: o.name,
        sub: o.phone,
      }));
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

function useListingsSearchReal(q: string) {
  return useQuery<SearchItem[]>({
    queryKey: ['listings-search-real', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const data = await adminApi.listListings();
      const all: { id: number; title: string; address?: string }[] = data.listings || [];
      const lower = q.toLowerCase();
      return all
        .filter(l => l.title?.toLowerCase().includes(lower) || l.address?.toLowerCase().includes(lower))
        .slice(0, 8)
        .map(l => ({ id: l.id, label: l.title, sub: l.address }));
    },
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}



/* ══════════════════════════════════════════════════════════════ */
export default function CrmCalendar() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Auth-Token': token || '' }), [token]);

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(toLocalDateStr(now));
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState<EventFormState>(EMPTY_FORM);
  const [links, setLinks] = useState<LinkField>(EMPTY_LINKS);
  const [editing, setEditing] = useState<CrmEvent | null>(null);

  /* поисковые строки */
  const [dealQ,    setDealQ]    = useState('');
  const [ownerQ,   setOwnerQ]   = useState('');
  const [listingQ, setListingQ] = useState('');

  const { data: dealResults = [],    isFetching: dealFetching    } = useDealsSearch(token || '', dealQ);
  const { data: ownerResults = [],   isFetching: ownerFetching   } = useOwnersSearch(token || '', ownerQ);
  const { data: listingResults = [], isFetching: listingFetching } = useListingsSearchReal(listingQ);

  const { data: events = [], isLoading } = useQuery<CrmEvent[]>({
    queryKey: ['crm-events', year, month],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/events?year=${year}&month=${month + 1}`, { headers });
      if (!r.ok) throw new Error('Ошибка загрузки');
      return r.json();
    },
  });

  const eventsByDate = useMemo(() => {
    const map: Record<string, CrmEvent[]> = {};
    for (const e of events) {
      const d = e.starts_at.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return map;
  }, [events]);

  const selectedEvents = selected ? (eventsByDate[selected] || []) : [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-events', year, month] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${CRM_URL}/events`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          event_type: form.event_type,
          starts_at: form.starts_at,
          ends_at: form.ends_at || undefined,
          deal_id: links.deal_id || undefined,
          owner_id: links.owner_id || undefined,
          listing_id: links.listing_id || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => { toast.success('Создано'); closeModal(); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const r = await fetch(`${CRM_URL}/events/${editing.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          event_type: form.event_type,
          starts_at: form.starts_at,
          ends_at: form.ends_at || undefined,
          deal_id: links.deal_id,
          owner_id: links.owner_id,
          listing_id: links.listing_id,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => { toast.success('Сохранено'); closeModal(); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${CRM_URL}/events/${id}`, {
        method: 'PUT', headers, body: JSON.stringify({ is_done: true }),
      });
      return r.json();
    },
    onSuccess: () => { toast.success('Выполнено'); invalidate(); },
  });

  function closeModal() {
    setModal(false); setEditing(null);
    setForm(EMPTY_FORM); setLinks(EMPTY_LINKS);
    setDealQ(''); setOwnerQ(''); setListingQ('');
  }

  function openCreate(dateStr?: string) {
    const dt = dateStr ? `${dateStr}T09:00` : `${toLocalDateStr(now)}T09:00`;
    setForm({ ...EMPTY_FORM, starts_at: dt });
    setLinks(EMPTY_LINKS);
    setEditing(null);
    setModal(true);
  }

  function openEdit(ev: CrmEvent) {
    setForm({
      title: ev.title,
      description: ev.description || '',
      event_type: ev.event_type,
      starts_at: ev.starts_at.slice(0, 16),
      ends_at: ev.ends_at?.slice(0, 16) || '',
    });
    setLinks({
      deal_id: ev.deal_id || null,    deal_label: ev.deal_title || '',
      owner_id: ev.owner_id || null,  owner_label: ev.owner_name || '',
      listing_id: ev.listing_id || null, listing_label: ev.listing_title || '',
    });
    setEditing(ev);
    setModal(true);
  }

  function submitForm() {
    if (!form.title.trim()) return toast.error('Введите название');
    if (!form.starts_at)    return toast.error('Укажите дату');
    if (editing) { updateMutation.mutate(); } else { createMutation.mutate(); }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const calDays  = buildCalendarDays(year, month);
  const todayStr = toLocalDateStr(now);
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-700">Календарь</h2>
          <p className="text-sm text-muted-foreground">Заметки, события и напоминания по сделкам и объектам</p>
        </div>
        <Button className="bg-brand-blue text-white" onClick={() => openCreate(selected || undefined)}>
          <Icon name="Plus" size={15} className="mr-1.5" />
          Новое событие
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Сетка календаря ────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-muted transition">
              <Icon name="ChevronLeft" size={18} />
            </button>
            <span className="font-display font-700 text-lg">{MONTHS_RU[month]} {year}</span>
            <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-muted transition">
              <Icon name="ChevronRight" size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {calDays.map((date, i) => {
                if (!date) return <div key={i} />;
                const ds = toLocalDateStr(date);
                const dayEvents = eventsByDate[ds] || [];
                const isToday    = ds === todayStr;
                const isSelected = ds === selected;
                return (
                  <button
                    key={ds}
                    onClick={() => setSelected(ds)}
                    className={`relative min-h-[52px] rounded-xl p-1.5 text-left transition border ${
                      isSelected
                        ? 'bg-brand-blue border-brand-blue text-white'
                        : isToday
                        ? 'border-brand-blue/40 bg-brand-blue/5'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : isToday ? 'text-brand-blue' : ''}`}>
                      {date.getDate()}
                    </span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${
                          e.is_done         ? 'bg-muted-foreground opacity-40'
                          : e.event_type === 'note'     ? 'bg-yellow-400'
                          : e.event_type === 'event'    ? 'bg-blue-500'
                          : 'bg-purple-500'
                        }`} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className={`text-[9px] font-bold ${isSelected ? 'text-white/70' : 'text-muted-foreground'}`}>
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            {Object.entries(TYPE_META).map(([type, meta]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${type === 'note' ? 'bg-yellow-400' : type === 'event' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                {meta.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Панель дня ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">
                {selected
                  ? new Date(selected + 'T00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })
                  : 'Выберите день'}
              </div>
              {selected && (
                <button onClick={() => openCreate(selected)} className="text-brand-blue hover:bg-brand-blue/10 rounded-lg p-1 transition">
                  <Icon name="Plus" size={16} />
                </button>
              )}
            </div>

            {selectedEvents.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-6">
                <Icon name="CalendarX2" size={28} className="mx-auto mb-2 opacity-30" />
                Событий нет
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(ev => {
                  const meta = TYPE_META[ev.event_type];
                  return (
                    <div key={ev.id} className={`rounded-xl border p-3 space-y-1 transition ${
                      ev.is_done ? 'opacity-50 bg-muted/40 border-border' : `${meta.bg} ${meta.border}`
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Icon name={meta.icon} size={13} className={ev.is_done ? 'text-muted-foreground' : meta.color} />
                          <span className={`text-sm font-semibold truncate ${ev.is_done ? 'line-through text-muted-foreground' : ''}`}>
                            {ev.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!ev.is_done && (
                            <button onClick={() => doneMutation.mutate(ev.id)}
                              className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 transition" title="Выполнено">
                              <Icon name="Check" size={13} />
                            </button>
                          )}
                          <button onClick={() => openEdit(ev)}
                            className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition" title="Редактировать">
                            <Icon name="Pencil" size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ev.starts_at.slice(11, 16)}{ev.ends_at && ` — ${ev.ends_at.slice(11, 16)}`}
                      </div>
                      {ev.description && (
                        <div className="text-xs text-foreground/80 line-clamp-2">{ev.description}</div>
                      )}
                      {(ev.deal_title || ev.owner_name || ev.listing_title) && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {ev.deal_title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-medium truncate max-w-[130px]">
                              <Icon name="Handshake" size={9} className="inline mr-0.5" />{ev.deal_title}
                            </span>
                          )}
                          {ev.owner_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 font-medium truncate max-w-[130px]">
                              <Icon name="User" size={9} className="inline mr-0.5" />{ev.owner_name}
                            </span>
                          )}
                          {ev.listing_title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium truncate max-w-[130px]">
                              <Icon name="MapPin" size={9} className="inline mr-0.5" />{ev.listing_title}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <UpcomingReminders token={token || ''} />
        </div>
      </div>

      {/* ── Модалка ─────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg">{editing ? 'Редактировать' : 'Новое событие'}</h3>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-muted">
                <Icon name="X" size={18} />
              </button>
            </div>

            {/* Тип */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Тип</label>
              <div className="flex gap-2">
                {(Object.keys(TYPE_META) as EventType[]).map(t => {
                  const m = TYPE_META[t];
                  return (
                    <button key={t} type="button"
                      onClick={() => setForm(f => ({ ...f, event_type: t }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition ${
                        form.event_type === t ? `${m.bg} ${m.border} ${m.color}` : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Icon name={m.icon} size={13} />{m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Название */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Название</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Звонок клиенту, показ квартиры..." autoFocus />
            </div>

            {/* Описание */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Описание</label>
              <textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="Дополнительные детали..." />
            </div>

            {/* Дата/время */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Начало</label>
                <input type="datetime-local" value={form.starts_at}
                  onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Конец</label>
                <input type="datetime-local" value={form.ends_at}
                  onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
              </div>
            </div>

            {/* Привязки — поиск */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Привязать к</label>
              <div className="space-y-2">
                <SearchDropdown
                  label="Сделка"
                  icon="Handshake"
                  colorClass="text-blue-700"
                  value={dealQ}
                  selectedId={links.deal_id}
                  onSelect={(id, label) => { setLinks(l => ({ ...l, deal_id: id, deal_label: label })); setDealQ(label); }}
                  onClear={() => { setLinks(l => ({ ...l, deal_id: null, deal_label: '' })); setDealQ(''); }}
                  items={dealResults}
                  loading={dealFetching}
                  onSearch={setDealQ}
                  placeholder="Начните вводить название сделки..."
                />
                <SearchDropdown
                  label="Собственник / Лид"
                  icon="User"
                  colorClass="text-purple-700"
                  value={ownerQ}
                  selectedId={links.owner_id}
                  onSelect={(id, label) => { setLinks(l => ({ ...l, owner_id: id, owner_label: label })); setOwnerQ(label); }}
                  onClear={() => { setLinks(l => ({ ...l, owner_id: null, owner_label: '' })); setOwnerQ(''); }}
                  items={ownerResults}
                  loading={ownerFetching}
                  onSearch={setOwnerQ}
                  placeholder="Имя или телефон..."
                />
                <SearchDropdown
                  label="Объект недвижимости"
                  icon="MapPin"
                  colorClass="text-emerald-700"
                  value={listingQ}
                  selectedId={links.listing_id}
                  onSelect={(id, label) => { setLinks(l => ({ ...l, listing_id: id, listing_label: label })); setListingQ(label); }}
                  onClear={() => { setLinks(l => ({ ...l, listing_id: null, listing_label: '' })); setListingQ(''); }}
                  items={listingResults}
                  loading={listingFetching}
                  onSearch={setListingQ}
                  placeholder="Адрес или название объекта..."
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-brand-blue text-white" onClick={submitForm} disabled={isPending}>
                {isPending ? <Icon name="Loader2" size={15} className="animate-spin" /> : editing ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={closeModal}>Отмена</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Виджет ближайших напоминаний ── */
function UpcomingReminders({ token }: { token: string }) {
  const headers = { 'X-Auth-Token': token };
  const { data: events = [] } = useQuery<CrmEvent[]>({
    queryKey: ['crm-events-upcoming'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/events`, { headers });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const upcoming = events.filter(e => !e.is_done && e.event_type === 'reminder').slice(0, 5);
  if (upcoming.length === 0) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-purple-800">
        <Icon name="BellRing" size={15} />Напоминания
      </div>
      <div className="space-y-2">
        {upcoming.map(ev => (
          <div key={ev.id} className="flex items-start gap-2 text-xs text-purple-900">
            <Icon name="Clock" size={12} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">{ev.title}</div>
              <div className="text-purple-700">
                {new Date(ev.starts_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}, {ev.starts_at.slice(11, 16)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}