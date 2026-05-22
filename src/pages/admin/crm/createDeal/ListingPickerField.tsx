import { useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ListingResult } from './createDealHooks';

interface Props {
  listingId: string;
  listingLabel: string;
  setListingId: (v: string) => void;
  setListingLabel: (v: string) => void;
  listingSearch: string;
  setListingSearch: (v: string) => void;
  listingDropOpen: boolean;
  setListingDropOpen: (v: boolean) => void;
  listingResults: ListingResult[];
  listingFetching: boolean;
}

export default function ListingPickerField({
  listingId, listingLabel, setListingId, setListingLabel,
  listingSearch, setListingSearch, listingDropOpen, setListingDropOpen,
  listingResults, listingFetching,
}: Props) {
  const listingDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listingDropRef.current && !listingDropRef.current.contains(e.target as Node)) {
        setListingDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setListingDropOpen]);

  return (
    <div ref={listingDropRef} className="relative">
      <label className="text-xs text-muted-foreground">Объект недвижимости</label>
      {listingId ? (
        <div className="flex items-center justify-between px-3 py-2 border border-brand-blue/40 rounded-xl bg-brand-blue/5 text-sm">
          <span className="font-medium text-brand-blue truncate">{listingLabel}</span>
          <button type="button" onClick={() => { setListingId(''); setListingLabel(''); setListingSearch(''); }}
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
                    setListingId(String(l.id));
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
  );
}
