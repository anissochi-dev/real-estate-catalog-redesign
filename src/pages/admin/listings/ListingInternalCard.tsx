import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, CATS, DEALS } from './types';
import { TabId, TABS } from './internalCardTypes';
import { Spinner, TabOverview, TabPriceHistory, TabStats, TabLeads, TabComments } from './InternalCardTabs1';
import { TabAi, TabDocuments, TabBroker } from './InternalCardTabs2';
import TabPhotos from './TabPhotos';

interface Props {
  listingId: number;
  onClose: () => void;
  onBrokerChanged?: () => void;
}

export default function ListingInternalCard({ listingId, onClose, onBrokerChanged }: Props) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState<TabId>('overview');
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi.getListing(listingId).then(r => {
      setListing(r.listing);
    }).finally(() => setLoading(false));
  }, [listingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyId = (id: number) => {
    navigator.clipboard?.writeText(String(id)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading || !listing) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <Icon name="Loader2" size={20} className="animate-spin text-brand-blue" />
          <span className="text-sm">Загрузка карточки...</span>
        </div>
      </div>
    );
  }

  const catLabel = CATS.find(c => c[0] === listing.category)?.[1] || listing.category;
  const dealLabel = DEALS.find(d => d[0] === listing.deal)?.[1] || listing.deal;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-700 text-base truncate">{listing.title}</span>
              {listing.public_code && (
                <button
                  onClick={() => copyId(listing.public_code!)}
                  title="Нажмите, чтобы скопировать ID"
                  className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-semibold shrink-0 hover:bg-brand-blue/20 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Icon name="Check" size={10} /> : <Icon name="Copy" size={10} />}
                  ID {listing.public_code}
                </button>
              )}
              {!listing.public_code && (
                <button
                  onClick={() => copyId(listing.id)}
                  title="Нажмите, чтобы скопировать ID"
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold shrink-0 hover:bg-muted/80 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Icon name="Check" size={10} /> : <Icon name="Copy" size={10} />}
                  #{listing.id}
                </button>
              )}
              {listing.is_hot && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold shrink-0">Горячее</span>}
              {listing.is_new && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">Новинка</span>}
              {listing.is_exclusive && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold shrink-0">Эксклюзив</span>}
              {listing.is_urgent && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">Срочно</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{catLabel} · {dealLabel} · {listing.city}{listing.district ? `, ${listing.district}` : ''}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4 overflow-x-auto shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && <TabOverview listing={listing} siteUrl={settings.site_url} />}
          {tab === 'photos' && <TabPhotos listing={listing} />}
          {tab === 'comments' && <TabComments listingId={listingId} />}
          {tab === 'price_history' && <TabPriceHistory listingId={listingId} />}
          {tab === 'stats' && <TabStats listingId={listingId} listing={listing} />}
          {tab === 'leads' && <TabLeads listingId={listingId} />}
          {tab === 'ai' && <TabAi listing={listing} />}
          {tab === 'documents' && <TabDocuments listingId={listingId} />}
          {tab === 'broker' && <TabBroker listing={listing} onSaved={() => { onBrokerChanged?.(); }} currentUserId={user?.id} />}
        </div>
      </div>
    </div>
  );
}