import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CRM_URL } from '@/lib/adminApi';

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

const TYPE_META: Record<EventType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  note:     { label: 'Заметка',     icon: 'StickyNote',  color: 'text-yellow-700',  bg: 'bg-yellow-50',  border: 'border-yellow-300' },
  event:    { label: 'Событие',     icon: 'CalendarCheck', color: 'text-blue-700',  bg: 'bg-blue-50',    border: 'border-blue-300'   },
  reminder: { label: 'Напоминание', icon: 'BellRing',    color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-300' },
};

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS_RU   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const dow   = (first.getDay() + 6) % 7; // пн=0
  const days: (Date | null)[] = [];
  for (let i = 0; i < dow; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

interface EventFormState {
  title: string;
  description: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
  deal_id: string;
  owner_id: string;
  listing_id: string;
}

const EMPTY_FORM: EventFormState = {
  title: '', description: '', event_type: 'note',
  starts_at: '', ends_at: '', deal_id: '', owner_id: '', listing_id: '',
};

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
  const [editing, setEditing] = useState<CrmEvent | null>(null);

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
    mutationFn: async (data: EventFormState) => {
      const r = await fetch(`${CRM_URL}/events`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: data.title,
          description: data.description || undefined,
          event_type: data.event_type,
          starts_at: data.starts_at,
          ends_at: data.ends_at || undefined,
          deal_id: data.deal_id ? Number(data.deal_id) : undefined,
          owner_id: data.owner_id ? Number(data.owner_id) : undefined,
          listing_id: data.listing_id ? Number(data.listing_id) : undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => { toast.success('Создано'); setModal(false); setForm(EMPTY_FORM); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<EventFormState & { is_done: boolean }> }) => {
      const r = await fetch(`${CRM_URL}/events/${id}`, {
        method: 'PUT', headers,
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => { toast.success('Сохранено'); setModal(false); setEditing(null); setForm(EMPTY_FORM); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${CRM_URL}/events/${id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_done: true }),
      });
      return r.json();
    },
    onSuccess: () => { toast.success('Отмечено'); invalidate(); },
  });

  function openCreate(dateStr?: string) {
    const dt = dateStr ? `${dateStr}T09:00` : `${toLocalDateStr(now)}T09:00`;
    setForm({ ...EMPTY_FORM, starts_at: dt });
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
      deal_id: ev.deal_id ? String(ev.deal_id) : '',
      owner_id: ev.owner_id ? String(ev.owner_id) : '',
      listing_id: ev.listing_id ? String(ev.listing_id) : '',
    });
    setEditing(ev);
    setModal(true);
  }

  function submitForm() {
    if (!form.title.trim()) return toast.error('Введите название');
    if (!form.starts_at) return toast.error('Укажите дату');
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const calDays = buildCalendarDays(year, month);
  const todayStr = toLocalDateStr(now);

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
        {/* ── Сетка календаря ──────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border p-5">
          {/* Шапка навигации */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-muted transition">
              <Icon name="ChevronLeft" size={18} />
            </button>
            <span className="font-display font-700 text-lg">{MONTHS_RU[month]} {year}</span>
            <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-muted transition">
              <Icon name="ChevronRight" size={18} />
            </button>
          </div>

          {/* Дни недели */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Ячейки */}
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
                const isToday = ds === todayStr;
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
                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : isToday ? 'text-brand-blue' : 'text-foreground'}`}>
                      {date.getDate()}
                    </span>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map(e => (
                        <span
                          key={e.id}
                          className={`w-1.5 h-1.5 rounded-full ${
                            e.is_done ? 'bg-muted-foreground opacity-40' :
                            e.event_type === 'note' ? 'bg-yellow-400' :
                            e.event_type === 'event' ? 'bg-blue-500' : 'bg-purple-500'
                          }`}
                        />
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

          {/* Легенда */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
            {Object.entries(TYPE_META).map(([type, meta]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${
                  type === 'note' ? 'bg-yellow-400' : type === 'event' ? 'bg-blue-500' : 'bg-purple-500'
                }`} />
                {meta.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Панель дня ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">
                {selected
                  ? new Date(selected + 'T00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })
                  : 'Выберите день'}
              </div>
              {selected && (
                <button
                  onClick={() => openCreate(selected)}
                  className="text-brand-blue hover:bg-brand-blue/10 rounded-lg p-1 transition"
                >
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
                    <div
                      key={ev.id}
                      className={`rounded-xl border p-3 space-y-1 transition ${
                        ev.is_done ? 'opacity-50 bg-muted/40 border-border' : `${meta.bg} ${meta.border}`
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Icon name={meta.icon} size={13} className={ev.is_done ? 'text-muted-foreground' : meta.color} />
                          <span className={`text-sm font-semibold truncate ${ev.is_done ? 'line-through text-muted-foreground' : ''}`}>
                            {ev.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!ev.is_done && (
                            <button
                              onClick={() => doneMutation.mutate(ev.id)}
                              className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 transition"
                              title="Отметить выполненным"
                            >
                              <Icon name="Check" size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(ev)}
                            className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition"
                            title="Редактировать"
                          >
                            <Icon name="Pencil" size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {ev.starts_at.slice(11, 16)}
                        {ev.ends_at && ` — ${ev.ends_at.slice(11, 16)}`}
                      </div>

                      {ev.description && (
                        <div className="text-xs text-foreground/80 line-clamp-2">{ev.description}</div>
                      )}

                      {(ev.deal_title || ev.owner_name || ev.listing_title) && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {ev.deal_title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-medium truncate max-w-[120px]">
                              <Icon name="Handshake" size={9} className="inline mr-0.5" />{ev.deal_title}
                            </span>
                          )}
                          {ev.owner_name && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 font-medium truncate max-w-[120px]">
                              <Icon name="User" size={9} className="inline mr-0.5" />{ev.owner_name}
                            </span>
                          )}
                          {ev.listing_title && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-medium truncate max-w-[120px]">
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

          {/* Ближайшие напоминания */}
          <UpcomingReminders token={token || ''} />
        </div>
      </div>

      {/* ── Модалка создания/редактирования ─────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg">
                {editing ? 'Редактировать' : 'Новое событие'}
              </h3>
              <button onClick={() => { setModal(false); setEditing(null); setForm(EMPTY_FORM); }} className="p-1 rounded-lg hover:bg-muted">
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
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, event_type: t }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition ${
                        form.event_type === t ? `${m.bg} ${m.border} ${m.color}` : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Icon name={m.icon} size={13} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Название */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Название</label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Звонок клиенту, показ квартиры..."
              />
            </div>

            {/* Описание */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Описание</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                placeholder="Дополнительные детали..."
              />
            </div>

            {/* Дата и время */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Начало</label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Конец</label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                />
              </div>
            </div>

            {/* Привязки */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Привязка (ID)</label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                    <Icon name="Handshake" size={10} />Сделка ID
                  </label>
                  <Input
                    type="number"
                    value={form.deal_id}
                    onChange={e => setForm(f => ({ ...f, deal_id: e.target.value }))}
                    placeholder="ID"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                    <Icon name="User" size={10} />Лид ID
                  </label>
                  <Input
                    type="number"
                    value={form.owner_id}
                    onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
                    placeholder="ID"
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                    <Icon name="MapPin" size={10} />Объект ID
                  </label>
                  <Input
                    type="number"
                    value={form.listing_id}
                    onChange={e => setForm(f => ({ ...f, listing_id: e.target.value }))}
                    placeholder="ID"
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-brand-blue text-white"
                onClick={submitForm}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? <Icon name="Loader2" size={15} className="animate-spin" />
                  : editing ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="outline" onClick={() => { setModal(false); setEditing(null); setForm(EMPTY_FORM); }}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

  const upcoming = events
    .filter(e => !e.is_done && e.event_type === 'reminder')
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-purple-800">
        <Icon name="BellRing" size={15} />
        Напоминания
      </div>
      <div className="space-y-2">
        {upcoming.map(ev => (
          <div key={ev.id} className="flex items-start gap-2 text-xs text-purple-900">
            <Icon name="Clock" size={12} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">{ev.title}</div>
              <div className="text-purple-700">
                {new Date(ev.starts_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                {', '}{ev.starts_at.slice(11, 16)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
