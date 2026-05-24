import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useBrokers, useListingsSearch } from './createDeal/createDealHooks';
import ListingPickerField from './createDeal/ListingPickerField';
import BrokerSelectField from './createDeal/BrokerSelectField';
import OwnerFromListing from './createDeal/OwnerFromListing';

export interface CreateDealForm {
  title: string;
  owner_id: string;
  listing_id: string;
  amount: string;
  commission: string;
  source: string;
  notes: string;
  assigned_to: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CreateDealForm;
  setForm: React.Dispatch<React.SetStateAction<CreateDealForm>>;
  /** Поля собственника больше не используются — данные подтягиваются из объекта. */
  ownerSearch?: string;
  setOwnerSearch?: (v: string) => void;
  ownerLabel?: string;
  setOwnerLabel?: (v: string) => void;
  ownerDropOpen?: boolean;
  setOwnerDropOpen?: (v: boolean) => void;
  listingSearch: string;
  setListingSearch: (v: string) => void;
  listingLabel: string;
  setListingLabel: (v: string) => void;
  listingDropOpen: boolean;
  setListingDropOpen: (v: boolean) => void;
  isPending: boolean;
  onSubmit: () => void;
  headers?: Record<string, string>;
  /** Может ли пользователь назначить брокера сделки (admin/director). */
  canAssignBroker?: boolean;
  /** Текущий пользователь — для значения по умолчанию. */
  currentUserId?: number;
  /** ID редактируемой сделки. Если задан — окно работает в режиме редактирования. */
  editingDealId?: number | null;
}

export default function CrmCreateDealModal({
  open, onOpenChange,
  form, setForm,
  listingSearch, setListingSearch, listingLabel, setListingLabel, listingDropOpen, setListingDropOpen,
  isPending, onSubmit,
  canAssignBroker, currentUserId,
  editingDealId,
}: Props) {
  const isEdit = !!editingDealId;
  // Список брокеров (для admin/director)
  const { data: brokers = [] } = useBrokers(!!canAssignBroker && open);

  const { data: listingResults = [], isFetching: listingFetching } = useListingsSearch(listingSearch);

  // Собственник, подтянутый из выбранного объекта (для отображения, неизменяем)
  const ownerFromListing = (() => {
    if (!form.listing_id) return null;
    const found = listingResults.find(l => String(l.id) === form.listing_id);
    if (found && (found.owner_name || found.owner_phone)) {
      return { name: found.owner_name, phone: found.owner_phone };
    }
    // Если объект уже выбран и нет в текущей выдаче — берём имя из метки
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать сделку' : 'Новая сделка'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs text-muted-foreground">Название *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Аренда офиса 150 м²" />
          </div>

          {/* Объект — выбирается первым. Собственник подтянется автоматически. */}
          <ListingPickerField
            listingId={form.listing_id}
            listingLabel={listingLabel}
            setListingId={v => setForm(f => ({ ...f, listing_id: v }))}
            setListingLabel={setListingLabel}
            listingSearch={listingSearch}
            setListingSearch={setListingSearch}
            listingDropOpen={listingDropOpen}
            setListingDropOpen={setListingDropOpen}
            listingResults={listingResults}
            listingFetching={listingFetching}
          />

          {/* Брокер сделки — только админ/директор может назначать */}
          {canAssignBroker && (
            <BrokerSelectField
              value={form.assigned_to}
              currentUserId={currentUserId}
              brokers={brokers}
              onChange={v => setForm(f => ({ ...f, assigned_to: v }))}
            />
          )}

          {/* Собственник — подтягивается из объекта автоматически */}
          {form.listing_id && (ownerFromListing || listingLabel) && (
            <OwnerFromListing ownerFromListing={ownerFromListing} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Сумма сделки</label>
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1 500 000" type="number" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Комиссия</label>
              <Input value={form.commission} onChange={e => setForm(f => ({ ...f, commission: e.target.value }))} placeholder="75 000" type="number" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Источник</label>
            <Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Авито, Звонок, Рекомендация..." />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Заметки</label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button
              className="bg-brand-blue text-white"
              disabled={!form.title || isPending}
              onClick={onSubmit}
            >
              {isPending && <Icon name="Loader2" size={15} className="animate-spin mr-1" />}
              {isEdit ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}