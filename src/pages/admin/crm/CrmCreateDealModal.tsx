import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/adminApi';

export interface CreateDealForm {
  title: string;
  owner_id: string;
  listing_id: string;
  amount: string;
  commission: string;
  source: string;
  notes: string;
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
}

export default function CrmCreateDealModal({
  open, onOpenChange,
  form, setForm,
  listingSearch, setListingSearch, listingLabel, setListingLabel, listingDropOpen, setListingDropOpen,
  isPending, onSubmit,
}: Props) {
  const listingDropRef = useRef<HTMLDivElement>(null);

  const { data: listingResults = [], isFetching: listingFetching } = useQuery<{ id: number; title: string; owner_name: string; owner_phone: string }[]>({
    queryKey: ['crm-listings-search', listingSearch],
    queryFn: async () => {
      if (listingSearch.length < 2) return [];
      const d = await adminApi.listListings();
      const all: { id: number; title: string; owner_name?: string; owner_phone?: string }[] = d.listings || [];
      const lower = listingSearch.toLowerCase();
      return all
        .filter(l => l.title?.toLowerCase().includes(lower) || String(l.id) === listingSearch)
        .slice(0, 8)
        .map(l => ({ id: l.id, title: l.title, owner_name: l.owner_name || '', owner_phone: l.owner_phone || '' }));
    },
    enabled: listingSearch.length >= 2,
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listingDropRef.current && !listingDropRef.current.contains(e.target as Node)) {
        setListingDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setListingDropOpen]);

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
          <DialogTitle>Новая сделка</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs text-muted-foreground">Название *</label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Аренда офиса 150 м²" />
          </div>

          {/* Объект — выбирается первым. Собственник подтянется автоматически. */}
          <div ref={listingDropRef} className="relative">
            <label className="text-xs text-muted-foreground">Объект недвижимости</label>
            {form.listing_id ? (
              <div className="flex items-center justify-between px-3 py-2 border border-brand-blue/40 rounded-xl bg-brand-blue/5 text-sm">
                <span className="font-medium text-brand-blue truncate">{listingLabel}</span>
                <button type="button" onClick={() => { setForm(f => ({ ...f, listing_id: '' })); setListingLabel(''); setListingSearch(''); }}
                  className="ml-2 shrink-0 text-muted-foreground hover:text-red-500">
                  <Icon name="X" size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={listingSearch}
                  onChange={e => { setListingSearch(e.target.value); setListingDropOpen(true); }}
                  onFocus={() => setListingDropOpen(true)}
                  placeholder="Поиск объекта по названию..."
                  className="pr-8"
                />
                {listingFetching && (
                  <Icon name="Loader2" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {listingDropOpen && listingResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {listingResults.map(l => (
                      <button key={l.id} type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted transition text-sm"
                        onMouseDown={() => {
                          setForm(f => ({ ...f, listing_id: String(l.id) }));
                          setListingLabel(`#${l.id} ${l.title}`);
                          setListingDropOpen(false);
                        }}>
                        <div className="font-medium truncate">{l.title}</div>
                        {l.owner_name && <div className="text-xs text-muted-foreground">{l.owner_name}{l.owner_phone ? ` · ${l.owner_phone}` : ''}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Собственник — подтягивается из объекта автоматически */}
          {form.listing_id && (ownerFromListing || listingLabel) && (
            <div className="bg-muted/40 border border-border rounded-xl px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-0.5">
                <Icon name="User" size={10} />
                Собственник <span className="text-muted-foreground/70 normal-case tracking-normal">(из объекта)</span>
              </div>
              {ownerFromListing ? (
                <div className="text-sm">
                  <span className="font-medium">{ownerFromListing.name || 'Без имени'}</span>
                  {ownerFromListing.phone && (
                    <span className="text-muted-foreground ml-2">{ownerFromListing.phone}</span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Данные подтянутся после загрузки объекта</div>
              )}
            </div>
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
              Создать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}