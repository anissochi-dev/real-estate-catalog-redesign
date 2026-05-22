import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CharCount from '@/components/ui/CharCount';
import {
  CrmEvent, EventFormState, LinkField,
  EMPTY_FORM, EMPTY_LINKS,
} from './calendarTypes';
import EventDateTimeBlock from './EventDateTimeBlock';
import { useListingsSearchReal, useClientSearch } from './calendar/eventModalHooks';
import SearchDropdown from './calendar/SearchDropdown';

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
