import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, CATS, DEALS } from './types';
import { TabId, TABS } from './internalCardTypes';
import { Spinner, TabOverview, TabPriceHistory, TabStats, TabLeads, TabComments, TabRadar } from './InternalCardTabs1';
import { fmtListingId } from '@/lib/formatPrice';
import { TabAi, TabDocuments, TabBroker, TabQrBanner } from './InternalCardTabs2';
import TabPhotos from './TabPhotos';

interface Props {
  listingId: number;
  onClose: () => void;
  onBrokerChanged?: () => void;
  onEdit?: (listing: Listing) => void;
}

// radar — первая вкладка, остальные основные, «Ещё» — служебные
const PRIMARY_TABS: TabId[] = ['radar', 'overview', 'photos', 'leads', 'comments'];
const MORE_TABS: TabId[] = ['documents', 'broker', 'qr_banner'];

export default function ListingInternalCard({ listingId, onClose, onBrokerChanged, onEdit }: Props) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState<TabId>('radar');
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const isAdminOrDirector = user && ['admin', 'director'].includes(user.role);
  const isOwnBroker = user?.role === 'broker' && (
    listing.broker_id === user.id ||
    (listing as Record<string, unknown>).author_id === user.id
  );
  const isForeignBroker = user?.role === 'broker' && !isOwnBroker;
  const canManageBroker = isAdminOrDirector;

  // Для чужого брокера скрываем служебные вкладки: история цен, статистика, документы, назначение брокера
  const visibleMoreTabs: TabId[] = MORE_TABS.filter(t => {
    if (t === 'broker') return !!canManageBroker;
    if (isForeignBroker) return false; // чужой брокер не видит «Ещё»
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-border shrink-0">
          {/* Строка 1: заголовок + X */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-700 text-base leading-snug">{listing.title}</span>
                <button
                  onClick={() => copyId(fmtListingId(listing.id, listing.created_at))}
                  title="Нажмите, чтобы скопировать ID"
                  className="text-xs px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue font-mono font-semibold shrink-0 hover:bg-brand-blue/20 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Icon name="Check" size={10} /> : <Icon name="Copy" size={10} />}
                  #{fmtListingId(listing.id, listing.created_at)}
                </button>
                {listing.is_hot && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold shrink-0">Горячее</span>}
                {listing.is_new && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">Новинка</span>}
                {listing.is_exclusive && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold shrink-0">Эксклюзив</span>}
                {listing.is_urgent && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold shrink-0">Срочно</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {catLabel} · {dealLabel}{listing.city ? ` · ${listing.city}${listing.district ? `, ${listing.district}` : ''}` : ''}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted shrink-0 -mt-1">
              <Icon name="X" size={18} />
            </button>
          </div>
          {/* Строка 2: кнопка редактировать — только admin, director, брокер своего объекта */}
          {onEdit && (() => {
            const canEdit = user && (
              ['admin', 'director'].includes(user.role) ||
              user.role !== 'broker' ||
              listing.broker_id === user.id ||
              (listing as { author_id?: number | null }).author_id === user.id
            );
            return canEdit ? (
              <div className="mt-2">
                <button
                  onClick={() => { onEdit(listing); onClose(); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 transition w-full sm:w-auto justify-center sm:justify-start"
                >
                  <Icon name="Pencil" size={14} />
                  Редактировать
                </button>
              </div>
            ) : null;
          })()}
        </div>

        {/* Tabs */}
        <div className="flex items-stretch border-b border-border shrink-0 px-2 sm:px-4">
          {/* Основные вкладки */}
          {TABS.filter(t => PRIMARY_TABS.includes(t.id)).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMoreOpen(false); }}
              className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-w-0 ${
                tab === t.id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={t.icon} size={15} />
              <span className="leading-tight text-center">{t.label}</span>
            </button>
          ))}

          {/* Кнопка «Ещё» — скрыта если нет доступных вкладок */}
          <div ref={moreRef} className={`relative ml-auto flex-shrink-0 ${visibleMoreTabs.length === 0 ? 'hidden' : ''}`}>
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors h-full ${
                visibleMoreTabs.includes(tab)
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name="MoreHorizontal" size={15} />
              <span>{visibleMoreTabs.includes(tab) ? (TABS.find(t => t.id === tab)?.label ?? 'Ещё') : 'Ещё'}</span>
            </button>

            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-50 py-1 min-w-[160px]">
                {TABS.filter(t => visibleMoreTabs.includes(t.id)).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setMoreOpen(false); }}
                    className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${
                      tab === t.id ? 'text-brand-blue bg-brand-blue/5 font-semibold' : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon name={t.icon} size={15} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'radar' && <TabRadar listingId={listingId} listing={listing} />}
          {tab === 'overview' && <TabOverview listing={listing} siteUrl={settings.site_url} />}
          {tab === 'photos' && <TabPhotos listing={listing} />}
          {tab === 'comments' && <TabComments listingId={listingId} />}
          {tab === 'price_history' && <TabPriceHistory listingId={listingId} />}
          {tab === 'stats' && <TabStats listingId={listingId} listing={listing} />}
          {tab === 'leads' && <TabLeads listingId={listingId} />}
          {tab === 'ai' && <TabAi listing={listing} />}
          {tab === 'documents' && <TabDocuments listingId={listingId} />}
          {tab === 'broker' && <TabBroker listing={listing} onSaved={() => { onBrokerChanged?.(); }} currentUserId={user?.id} />}
          {tab === 'qr_banner' && <TabQrBanner listing={listing} siteUrl={settings.site_url} />}
        </div>
      </div>
    </div>
  );
}