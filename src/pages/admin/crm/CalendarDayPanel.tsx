import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { crmUrl } from '@/lib/adminApi';
import { CrmEvent, TYPE_META } from './calendarTypes';

/* ── Виджет ближайших напоминаний ── */
function UpcomingReminders({ token }: { token: string }) {
  const headers = { 'X-Auth-Token': token };
  const { data: events = [] } = useQuery<CrmEvent[]>({
    queryKey: ['crm-events-upcoming'],
    queryFn: async () => {
      const r = await fetch(crmUrl('events'), { headers });
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

/* ── Панель дня ── */
interface Props {
  selected: string | null;
  selectedEvents: CrmEvent[];
  token: string;
  onOpenCreate: (dateStr?: string) => void;
  onOpenEdit: (ev: CrmEvent) => void;
  onMarkDone: (id: number) => void;
}

export default function CalendarDayPanel({
  selected, selectedEvents, token, onOpenCreate, onOpenEdit, onMarkDone,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">
            {selected
              ? new Date(selected + 'T00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })
              : 'Выберите день'}
          </div>
          {selected && (
            <button onClick={() => onOpenCreate(selected)} className="text-brand-blue hover:bg-brand-blue/10 rounded-lg p-1 transition">
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
                        <button onClick={() => onMarkDone(ev.id)}
                          className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 transition" title="Выполнено">
                          <Icon name="Check" size={13} />
                        </button>
                      )}
                      <button onClick={() => onOpenEdit(ev)}
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

      <UpcomingReminders token={token} />
    </div>
  );
}