import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CRM_URL, adminApi } from '@/lib/adminApi';
import {
  CrmEvent, EventType, EventFormState, LinkField, SearchItem,
  TYPE_META, EMPTY_FORM, EMPTY_LINKS,
} from './calendarTypes';

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

/* ── Хук поиска лидов ── */
function useLeadsSearch(token: string, q: string) {
  return useQuery<SearchItem[]>({
    queryKey: ['leads-search', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const data = await fetch(`${CRM_URL}/leads?search=${encodeURIComponent(q)}&limit=8`, {
        headers: { 'X-Auth-Token': token },
      }).then(r => r.json()).catch(() => ({}));
      return (data.leads || []).map((l: { id: number; name: string; phone?: string }) => ({
        id: l.id,
        label: l.name,
        sub: l.phone,
      }));
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
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
  const [dealQ,    setDealQ]    = useState(initialLinks.deal_label);
  const [ownerQ,   setOwnerQ]   = useState(initialLinks.owner_label);
  const [listingQ, setListingQ] = useState(initialLinks.listing_label);
  const [leadQ, setLeadQ] = useState('');

  useEffect(() => {
    setForm(initialForm);
    setLinks(initialLinks);
    setDealQ(initialLinks.deal_label);
    setOwnerQ(initialLinks.owner_label);
    setListingQ(initialLinks.listing_label);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const { data: dealResults = [],    isFetching: dealFetching    } = useDealsSearch(token, dealQ);
  const { data: ownerResults = [],   isFetching: ownerFetching   } = useOwnersSearch(token, ownerQ);
  const { data: listingResults = [], isFetching: listingFetching } = useListingsSearchReal(listingQ);
  const { data: leadResults = [],    isFetching: leadFetching    } = useLeadsSearch(token, leadQ);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Введите название события';
    if (!form.starts_at) e.starts_at = 'Укажите дату и время начала';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) onSubmit(form, links);
  };

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
          <textarea rows={2} value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            placeholder="Дополнительные детали..." />
        </div>

        {/* Дата/время */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Начало <span className="text-red-500">*</span>
            </label>
            <input type="datetime-local" value={form.starts_at}
              onChange={e => { setForm(f => ({ ...f, starts_at: e.target.value })); setErrors(er => ({ ...er, starts_at: '' })); }}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 ${errors.starts_at ? 'border-red-400' : ''}`} />
            {errors.starts_at && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><Icon name="AlertCircle" size={11} />{errors.starts_at}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Конец</label>
            <input type="datetime-local" value={form.ends_at}
              onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
          </div>
        </div>

        {/* Привязки */}
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
              label="Собственник"
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
              label="Лид (заявка)"
              icon="Inbox"
              colorClass="text-orange-700"
              value={leadQ}
              selectedId={links.lead_id ?? null}
              onSelect={(id, label) => { setLinks(l => ({ ...l, lead_id: id, lead_label: label })); setLeadQ(label); }}
              onClear={() => { setLinks(l => ({ ...l, lead_id: null, lead_label: '' })); setLeadQ(''); }}
              items={leadResults}
              loading={leadFetching}
              onSearch={setLeadQ}
              placeholder="Имя клиента или телефон..."
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
          <Button className="flex-1 bg-brand-blue text-white" onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Icon name="Loader2" size={15} className="animate-spin" /> : editing ? 'Сохранить' : 'Создать'}
          </Button>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </div>
  );
}