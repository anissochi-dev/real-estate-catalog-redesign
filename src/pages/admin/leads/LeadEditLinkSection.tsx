import { useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Lead, Listing, STATUSES } from './leadsTypes';
import SeoHeadingsBlock, { SeoHeadings } from '@/components/admin/SeoHeadingsBlock';

function generateLeadHeadings(lead: Partial<Lead>): SeoHeadings {
  const name = lead.name || 'Клиент';
  const budget = lead.budget
    ? `бюджет ${(lead.budget / 1_000_000).toFixed(lead.budget >= 10_000_000 ? 0 : 1)} млн ₽`
    : '';
  const company = lead.company ? ` — ${lead.company}` : '';
  return {
    h1: `Заявка от ${name}${company}`,
    h2: budget
      ? `Подбор коммерческой недвижимости — ${budget}`
      : 'Подбор коммерческой недвижимости в Краснодаре',
    h3: lead.message
      ? lead.message.slice(0, 80)
      : 'Запрос на аренду или покупку объекта',
    h4: budget || 'Бюджет уточняется',
    h5: `Контакт: ${name}`,
  };
}

interface Props {
  editing: Partial<Lead>;
  setEditing: (l: Partial<Lead> | null) => void;
  listings: Listing[];
  listingSearch: string;
  setListingSearch: (v: string) => void;
  listingDropOpen: boolean;
  setListingDropOpen: (v: boolean) => void;
}

export default function LeadEditLinkSection({
  editing, setEditing, listings,
  listingSearch, setListingSearch,
  listingDropOpen, setListingDropOpen,
}: Props) {
  const listingDropRef = useRef<HTMLDivElement>(null);

  const filteredListings = listings.filter(l =>
    listingSearch.length < 1 ? true :
    l.title.toLowerCase().includes(listingSearch.toLowerCase()) ||
    String(l.id).includes(listingSearch)
  ).slice(0, 10);

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
    <>
    <div ref={listingDropRef} className="relative">
      <label className="text-xs text-muted-foreground">Привязка к объекту (необязательно)</label>
      {editing.listing_id ? (
        <div className="flex items-center justify-between px-3 py-2 border border-brand-blue/40 rounded-lg bg-brand-blue/5 text-sm">
          <span className="text-brand-blue font-medium truncate">
            {listings.find(l => l.id === editing.listing_id)
              ? `#${editing.listing_id} ${listings.find(l => l.id === editing.listing_id)?.title}`
              : `#${editing.listing_id}`}
          </span>
          <button type="button"
            onClick={() => { setEditing({ ...editing, listing_id: null }); setListingSearch(''); }}
            className="ml-2 shrink-0 text-muted-foreground hover:text-red-500">
            <Icon name="X" size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={listingSearch}
            onChange={e => { setListingSearch(e.target.value); setListingDropOpen(true); }}
            onFocus={() => setListingDropOpen(true)}
            placeholder="Поиск объекта по названию или ID..."
            className="w-full px-3 py-2 border rounded-lg text-sm pr-8"
          />
          <Icon name="Search" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          {listingDropOpen && listingSearch.length >= 1 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
              <button type="button"
                className="w-full text-left px-3 py-2 hover:bg-muted text-sm text-muted-foreground"
                onMouseDown={() => { setEditing({ ...editing, listing_id: null }); setListingDropOpen(false); setListingSearch(''); }}>
                — Без привязки —
              </button>
              {filteredListings.map(l => (
                <button key={l.id} type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                  onMouseDown={() => { setEditing({ ...editing, listing_id: l.id }); setListingDropOpen(false); setListingSearch(''); }}>
                  <span className="text-muted-foreground text-xs mr-1">#{l.id}</span>{l.title}
                </button>
              ))}
              {filteredListings.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Не найдено</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>

    <div>
      <label className="text-xs text-muted-foreground">Статус</label>
      <select className="w-full px-3 py-2 border rounded-lg" value={editing.status || 'new'}
        onChange={e => setEditing({ ...editing, status: e.target.value })}>
        {STATUSES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
      </select>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!editing.is_network_tenant}
        onChange={e => setEditing({ ...editing, is_network_tenant: e.target.checked })} />
      Сетевой арендатор
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={editing.show_on_main !== false}
        onChange={e => setEditing({ ...editing, show_on_main: e.target.checked })} />
      Показывать на главной странице
    </label>

    <SeoHeadingsBlock
      generated={generateLeadHeadings(editing)}
      value={{
        h1: editing.seo_h1 || undefined,
        h2: editing.seo_h2 || undefined,
        h3: editing.seo_h3 || undefined,
        h4: editing.seo_h4 || undefined,
        h5: editing.seo_h5 || undefined,
      }}
      onChange={(v: Partial<SeoHeadings>) => setEditing({
        ...editing,
        seo_h1: v.h1 || null,
        seo_h2: v.h2 || null,
        seo_h3: v.h3 || null,
        seo_h4: v.h4 || null,
        seo_h5: v.h5 || null,
      })}
    />
    </>
  );
}
