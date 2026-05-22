import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CharCount from '@/components/ui/CharCount';
import { crmUrl, adminApi } from '@/lib/adminApi';
import {
  CrmEvent, EventType, EventFormState, LinkField, SearchItem,
  TYPE_META, EMPTY_FORM, EMPTY_LINKS,
} from './calendarTypes';
import EventDateTimeBlock from './EventDateTimeBlock';

/* ── Хук поиска объектов ── */
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

/** Объединённый поиск клиента: телефонная база + заявки + собственники объектов.
 * id отрицательный для phone_contacts (минус id), положительный — для leads.
 * sub — телефон (или компания).
 */
interface ClientSearchItem extends SearchItem {
  source: 'phone' | 'lead' | 'owner';
  phone?: string;
  /** Положительный id — для записи в lead_id. Если выбрана запись из телефонной базы — lead_id остаётся null,
   * но название/телефон сохраняются в title (для отображения).
   */
  leadId?: number | null;
}

function useClientSearch(token: string, q: string) {
  return useQuery<ClientSearchItem[]>({
    queryKey: ['client-search', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const results: ClientSearchItem[] = [];

      // 1) Телефонная база
      try {
        const data = await adminApi.searchPhones(q);
        const items = (data.contacts || data.results || data || []) as
          { id: number; name?: string; phone?: string; company?: string }[];
        for (const it of items.slice(0, 6)) {
          const name = it.name || it.phone || '—';
          results.push({
            id: -it.id, // отрицательный — для phone_contact
            label: name,
            sub: it.phone + (it.company ? ` · ${it.company}` : ''),
            source: 'phone',
            phone: it.phone,
            leadId: null,
          });
        }
      } catch { /* showError уже сработал */ }

      // 2) Заявки (Leads)
      try {
        const r = await fetch(crmUrl('leads', null, null, { search: q, limit: 6 }), {
          headers: { 'X-Auth-Token': token },
        });
        const data = await r.json().catch(() => ({}));
        const items = (data.leads || []) as { id: number; name: string; phone?: string }[];
        for (const it of items) {
          results.push({
            id: it.id,
            label: it.name,
            sub: it.phone ? `Заявка · ${it.phone}` : 'Заявка',
            source: 'lead',
            phone: it.phone,
            leadId: it.id,
          });
        }
      } catch { /* ignore */ }

      // 3) Собственники объектов
      try {
        const r = await fetch(crmUrl('owners', null, null, { search: q, limit: 6 }), {
          headers: { 'X-Auth-Token': token },
        });
        const data = await r.json().catch(() => ({}));
        const items = (data.owners || []) as { id: number; name: string; phone?: string }[];
        for (const it of items) {
          results.push({
            id: -100000 - it.id,
            label: it.name,
            sub: it.phone ? `Собственник · ${it.phone}` : 'Собственник',
            source: 'owner',
            phone: it.phone,
            leadId: null,
          });
        }
      } catch { /* ignore */ }

      // Дедупликация по телефону
      const seen = new Set<string>();
      return results.filter(r => {
        const key = (r.phone || r.label || String(r.id)).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
    },
    enabled: q.length >= 2,
    staleTime: 15_000,
  });
}

/* ── Компонент поиска с выпадашкой ── */
type AnySearchItem = SearchItem & Partial<ClientSearchItem>;

interface SearchDropdownProps {
  label: string;
  icon: string;
  colorClass: string;
  value: string;
  hasSelected: boolean;
  selectedSub?: string;
  onSelect: (item: AnySearchItem) => void;
  onClear: () => void;
  items: AnySearchItem[];
  loading: boolean;
  onSearch: (q: string) => void;
  placeholder: string;
  renderItem?: (item: AnySearchItem) => React.ReactNode;
}

function SearchDropdown({
  label, icon, colorClass, value, hasSelected, selectedSub, onSelect, onClear,
  items, loading, onSearch, placeholder, renderItem,
}: SearchDropdownProps) {
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
      {hasSelected ? (
        <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colorClass} bg-white border-current/30`}>
          <div className="truncate">
            <div className="font-semibold">{value}</div>
            {selectedSub && <div className="text-[10px] opacity-70">{selectedSub}</div>}
          </div>
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
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
              {items.map(item => (
                <button
                  key={String(item.id)}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted transition text-xs border-b border-border/30 last:border-0"
                  onMouseDown={() => { onSelect(item); setOpen(false); }}
                >
                  {renderItem ? renderItem(item) : (
                    <>
                      <div className="font-medium truncate">{item.label}</div>
                      {item.sub && <div className="text-muted-foreground truncate">{item.sub}</div>}
                    </>
                  )}
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

/* ── Модалка событий ── */
interface Props {
  editing: CrmEvent | null;
  token: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (form: EventFormState, links: LinkField) => void;
  initialForm?: EventFormState;
  initialLinks?: LinkField;
}

export default function CalendarEventModal({
  editing, token, isPending, onClose, onSubmit,
  initialForm = EMPTY_FORM,
  initialLinks = EMPTY_LINKS,
}: Props) {
  const [form, setForm]   = useState<EventFormState>(initialForm);
  const [links, setLinks] = useState<LinkField>(initialLinks);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Клиент: значение для поиска и доп. поля для отображения выбранного
  const [clientQ, setClientQ] = useState(initialLinks.lead_label || '');
  const [clientSub, setClientSub] = useState('');
  const [listingQ, setListingQ] = useState(initialLinks.listing_label);

  useEffect(() => {
    setForm(initialForm);
    setLinks(initialLinks);
    setClientQ(initialLinks.lead_label || '');
    setClientSub('');
    setListingQ(initialLinks.listing_label);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const { data: clientResults = [], isFetching: clientFetching } = useClientSearch(token, clientQ);
  const { data: listingResults = [], isFetching: listingFetching } = useListingsSearchReal(listingQ);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Введите название события';
    if (!form.starts_at) e.starts_at = 'Укажите дату и время начала';
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      e.starts_at = 'Окончание должно быть позже начала';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form, links);
  };

  const hasClient = (links.lead_id != null && links.lead_id !== 0)
    || (links.lead_label && links.lead_label.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-700 text-lg">{editing ? 'Редактировать' : 'Новое событие'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
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
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Название <span className="text-red-500">*</span>
          </label>
          <Input value={form.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setErrors(er => ({ ...er, title: '' })); }}
            placeholder="Звонок клиенту, показ квартиры..." autoFocus
            className={errors.title ? 'border-red-400' : ''} />
          {errors.title && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><Icon name="AlertCircle" size={11} />{errors.title}</p>}
        </div>

        {/* Описание */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Описание</label>
          <CharCount as="textarea" rows={2} max={500} warnAt={400}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))}
            className="text-sm"
            placeholder="Дополнительные детали..." />
        </div>

        {/* Дата/время */}
        <EventDateTimeBlock
          startsAt={form.starts_at}
          endsAt={form.ends_at}
          error={errors.starts_at}
          onChange={({ startsAt, endsAt }) => {
            setForm(f => ({ ...f, starts_at: startsAt, ends_at: endsAt }));
            setErrors(er => ({ ...er, starts_at: '' }));
          }}
        />

        {/* Привязки */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Привязать к</label>
          <div className="space-y-2">
            <SearchDropdown
              label="Клиент"
              icon="User"
              colorClass="text-purple-700"
              value={clientQ}
              hasSelected={!!hasClient}
              selectedSub={clientSub}
              onSelect={(item) => {
                setLinks(l => ({
                  ...l,
                  lead_id: item.leadId ?? null,
                  lead_label: item.label,
                }));
                setClientQ(item.label);
                setClientSub(item.sub || '');
              }}
              onClear={() => {
                setLinks(l => ({ ...l, lead_id: null, lead_label: '' }));
                setClientQ('');
                setClientSub('');
              }}
              items={clientResults}
              loading={clientFetching}
              onSearch={setClientQ}
              placeholder="Имя, телефон, компания..."
              renderItem={(item) => (
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    item.source === 'phone'  ? 'bg-emerald-500' :
                    item.source === 'lead'   ? 'bg-orange-500'  :
                    'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.label}</div>
                    {item.sub && <div className="text-muted-foreground truncate text-[10px]">{item.sub}</div>}
                  </div>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    {item.source === 'phone' ? 'Контакт' : item.source === 'lead' ? 'Заявка' : 'Объект'}
                  </span>
                </div>
              )}
            />

            <SearchDropdown
              label="Объект недвижимости"
              icon="MapPin"
              colorClass="text-emerald-700"
              value={listingQ}
              hasSelected={!!links.listing_id}
              onSelect={(item) => {
                setLinks(l => ({ ...l, listing_id: item.id, listing_label: item.label }));
                setListingQ(item.label);
              }}
              onClear={() => {
                setLinks(l => ({ ...l, listing_id: null, listing_label: '' }));
                setListingQ('');
              }}
              items={listingResults}
              loading={listingFetching}
              onSearch={setListingQ}
              placeholder="Адрес или название объекта..."
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button className="flex-1 bg-brand-blue text-white" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Icon name="Loader2" size={15} className="animate-spin" /> : editing ? 'Сохранить' : 'Создать'}
          </Button>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </div>
  );
}