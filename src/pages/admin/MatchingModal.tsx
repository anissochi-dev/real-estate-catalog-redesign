import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';
import { formatPhone } from '@/lib/phone';
import { PROPERTY_CATEGORIES_LEAD } from './leads/leadsTypes';
import { CATS, DEALS } from './listings/types';

interface MatchingLead {
  id: number;
  name: string;
  phone: string;
  phone_hidden?: boolean;
  status: string;
  property_type: string | null;
  property_category: string | null;
  budget: number | null;
  budget_to: number | null;
  area_from: number | null;
  area_to: number | null;
  company: string | null;
  message: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface MatchingListing {
  id: number;
  title: string;
  image: string | null;
  image_thumb?: string | null;
  price: number;
  area: number;
  city: string | null;
  district: string | null;
  deal: string;
  category: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  last_edited_at?: string | null;
}

interface Props {
  mode: 'leads_for_listing' | 'listings_for_lead';
  id: number;
  onClose: () => void;
  onOpenLead?: (id: number) => void;
  onOpenListing?: (id: number) => void;
}

export default function MatchingModal({ mode, id, onClose, onOpenLead, onOpenListing }: Props) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<MatchingLead[]>([]);
  const [listings, setListings] = useState<MatchingListing[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const fn = mode === 'leads_for_listing' ? adminApi.matchLeadsForListing : adminApi.matchListingsForLead;
    fn(id)
      .then((res: { results: (MatchingLead | MatchingListing)[] }) => {
        if (mode === 'leads_for_listing') setLeads((res.results || []) as MatchingLead[]);
        else setListings((res.results || []) as MatchingListing[]);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mode, id]);

  const title = mode === 'leads_for_listing' ? 'Подходящие заявки' : 'Подходящие объекты';
  const isEmpty = mode === 'leads_for_listing' ? leads.length === 0 : listings.length === 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="font-display font-700 text-base flex items-center gap-2">
            <Icon name={mode === 'leads_for_listing' ? 'Users' : 'Building2'} size={18} className="text-brand-blue" />
            {title}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-sm">
              <Icon name="Loader2" size={16} className="animate-spin" />
              Подбираем совпадения...
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Не удалось загрузить подбор. Попробуйте ещё раз.
            </div>
          )}

          {!loading && !error && isEmpty && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Icon name="SearchX" size={28} className="mx-auto mb-2 opacity-30" />
              Совпадений не найдено
            </div>
          )}

          {!loading && !error && mode === 'leads_for_listing' && leads.map(l => {
            const catLabel = PROPERTY_CATEGORIES_LEAD.find(c => c.value === l.property_category)?.label || l.property_category;
            return (
              <button
                key={l.id}
                onClick={() => onOpenLead?.(l.id)}
                className="w-full text-left p-3 rounded-xl border border-border hover:border-brand-blue/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{l.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">#{l.id}</span>
                </div>
                {l.company && <div className="text-xs text-muted-foreground">{l.company}</div>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {catLabel && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{catLabel}</span>
                  )}
                  {(l.budget || l.budget_to) && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {(l.budget ?? 0).toLocaleString('ru')} – {(l.budget_to ?? 0).toLocaleString('ru')} ₽
                    </span>
                  )}
                  {(l.area_from || l.area_to) && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {l.area_from ?? '—'} – {l.area_to ?? '—'} м²
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Icon name="Phone" size={11} />
                  {l.phone_hidden ? 'Скрыт' : formatPhone(l.phone)}
                </div>
              </button>
            );
          })}

          {!loading && !error && mode === 'listings_for_lead' && listings.map(it => {
            const dealLabel = DEALS.find(d => d[0] === it.deal)?.[1] || it.deal;
            const catLabel = CATS.find(c => c[0] === it.category)?.[1] || it.category;
            return (
              <button
                key={it.id}
                onClick={() => onOpenListing?.(it.id)}
                className="w-full text-left p-3 rounded-xl border border-border hover:border-brand-blue/40 hover:bg-muted/30 transition-colors flex gap-3"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {(it.image_thumb || it.image) ? (
                    <img src={it.image_thumb || it.image || ''} alt={it.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon name="Image" size={20} className="text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{it.title}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{it.id}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[it.city, it.district].filter(Boolean).join(' · ')}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{dealLabel}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{catLabel}</span>
                    <span className="text-[10px] font-semibold text-foreground">{(it.price || 0).toLocaleString('ru')} ₽</span>
                    <span className="text-[10px] text-muted-foreground">{it.area} м²</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
