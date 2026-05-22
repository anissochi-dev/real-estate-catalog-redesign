import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { crmUrl } from '@/lib/adminApi';
import {
  CrmEvent, EventFormState, LinkField,
  EMPTY_FORM, EMPTY_LINKS, toLocalDateStr,
} from './calendarTypes';
import CalendarGrid from './CalendarGrid';
import CalendarDayPanel from './CalendarDayPanel';
import CalendarEventModal from './CalendarEventModal';

export default function CrmCalendar() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'X-Auth-Token': token || '' }), [token]);

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string | null>(toLocalDateStr(now));
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<CrmEvent | null>(null);
  const [modalForm, setModalForm]   = useState<EventFormState>(EMPTY_FORM);
  const [modalLinks, setModalLinks] = useState<LinkField>(EMPTY_LINKS);

  const { data: events = [], isLoading } = useQuery<CrmEvent[]>({
    queryKey: ['crm-events', year, month],
    queryFn: async () => {
      const r = await fetch(crmUrl('events', null, null, { year, month: month + 1 }), { headers });
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
  const todayStr = toLocalDateStr(now);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['crm-events', year, month] });

  const createMutation = useMutation({
    mutationFn: async ({ form, links }: { form: EventFormState; links: LinkField }) => {
      // Если выбран контакт из телефонной базы (lead_id=null, есть lead_label) —
      // прикладываем имя клиента к описанию, чтобы не потерять.
      const extraNote = !links.lead_id && links.lead_label
        ? `Клиент: ${links.lead_label}`
        : '';
      const description = [form.description, extraNote].filter(Boolean).join('\n').trim();
      const r = await fetch(crmUrl('events'), {
        method: 'POST', headers,
        body: JSON.stringify({
          title: form.title,
          description: description || undefined,
          event_type: form.event_type,
          starts_at: form.starts_at,
          ends_at: form.ends_at || undefined,
          lead_id: links.lead_id || undefined,
          listing_id: links.listing_id || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'Ошибка');
      return json;
    },
    onSuccess: () => { toast.success('Событие создано'); closeModal(); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ form, links }: { form: EventFormState; links: LinkField }) => {
      if (!editing) return;
      const r = await fetch(crmUrl('events', editing.id), {
        method: 'PUT', headers,
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          event_type: form.event_type,
          starts_at: form.starts_at,
          ends_at: form.ends_at || undefined,
          lead_id: links.lead_id,
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
      const r = await fetch(crmUrl('events', id), {
        method: 'PUT', headers, body: JSON.stringify({ is_done: true }),
      });
      return r.json();
    },
    onSuccess: () => { toast.success('Выполнено'); invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(crmUrl('events', id), { method: 'DELETE', headers });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Ошибка удаления');
      }
    },
    onSuccess: () => { toast.success('Удалено'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function closeModal() {
    setModal(false);
    setEditing(null);
    setModalForm(EMPTY_FORM);
    setModalLinks(EMPTY_LINKS);
  }

  function openCreate(dateStr?: string) {
    const dt = dateStr ? `${dateStr}T09:00` : `${toLocalDateStr(now)}T09:00`;
    setModalForm({ ...EMPTY_FORM, starts_at: dt });
    setModalLinks(EMPTY_LINKS);
    setEditing(null);
    setModal(true);
  }

  function openEdit(ev: CrmEvent) {
    setModalForm({
      title: ev.title,
      description: ev.description || '',
      event_type: ev.event_type,
      starts_at: ev.starts_at.slice(0, 16),
      ends_at: ev.ends_at?.slice(0, 16) || '',
    });
    setModalLinks({
      deal_id: null, deal_label: '',
      owner_id: null, owner_label: '',
      listing_id: ev.listing_id || null, listing_label: ev.listing_title || '',
      lead_id: (ev as CrmEvent & { lead_id?: number }).lead_id ?? null,
      lead_label: (ev as CrmEvent & { lead_name?: string }).lead_name ?? '',
    });
    setEditing(ev);
    setModal(true);
  }

  function handleSubmit(form: EventFormState, links: LinkField) {
    if (!form.title.trim()) return toast.error('Введите название');
    if (!form.starts_at)    return toast.error('Укажите дату');
    if (editing) { updateMutation.mutate({ form, links }); }
    else         { createMutation.mutate({ form, links }); }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

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
        <CalendarGrid
          year={year}
          month={month}
          selected={selected}
          eventsByDate={eventsByDate}
          isLoading={isLoading}
          todayStr={todayStr}
          onSelectDay={setSelected}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />

        <CalendarDayPanel
          selected={selected}
          selectedEvents={selectedEvents}
          token={token || ''}
          onOpenCreate={openCreate}
          onOpenEdit={openEdit}
          onMarkDone={id => doneMutation.mutate(id)}
          onDelete={id => {
            if (confirm('Удалить напоминание?')) deleteMutation.mutate(id);
          }}
        />
      </div>

      {modal && (
        <CalendarEventModal
          editing={editing}
          token={token || ''}
          isPending={isPending}
          onClose={closeModal}
          onSubmit={handleSubmit}
          initialForm={modalForm}
          initialLinks={modalLinks}
        />
      )}
    </div>
  );
}