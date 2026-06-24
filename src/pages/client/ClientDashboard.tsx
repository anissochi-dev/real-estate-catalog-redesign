import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { formatPrice } from '@/lib/formatPrice';

const OWNER_URL =
  'https://functions.poehali.dev/b343cde2-4c90-4a07-8aca-05942c726b7c';

interface OwnerListing {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  area: number;
  address: string;
  image: string;
  status: string;
  is_visible: boolean;
  moderation_comment: string | null;
  views_site: number;
  created_at: string;
}

interface ListingStats {
  listing_id: number;
  views_site: number;
  views_qr: number;
  views_avito: number;
  views_yandex: number;
  views_cian: number;
  views_total: number;
  leads_count: number;
  by_day: { day: string; source: string; total: number }[];
}

interface OwnerLead {
  id: number;
  name: string;
  phone: string;
  message: string | null;
  status: string;
  lead_type: string;
  created_at: string;
}

export interface ClientDashboardProps {
  onExit: () => void;
}

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'moderation':
      return { text: 'На проверке', className: 'bg-amber-100 text-amber-700' };
    case 'active':
      return { text: 'Опубликован', className: 'bg-emerald-100 text-emerald-700' };
    case 'rejected':
      return { text: 'Отклонён', className: 'bg-red-100 text-red-700' };
    case 'archived':
      return { text: 'Архив', className: 'bg-gray-100 text-gray-500' };
    default:
      return { text: status, className: 'bg-gray-100 text-gray-500' };
  }
}

function leadStatusLabel(status: string): string {
  switch (status) {
    case 'new':
      return 'Новая';
    case 'in_progress':
      return 'В работе';
    case 'done':
      return 'Завершена';
    default:
      return status;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ClientDashboard({ onExit }: ClientDashboardProps) {
  const { user } = useAuth();
  const token = localStorage.getItem('biznest_token') ?? '';

  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<OwnerListing | null>(null);
  const [stats, setStats] = useState<ListingStats | null>(null);
  const [leads, setLeads] = useState<OwnerLead[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchListings = () => {
    setListingsLoading(true);
    fetch(`${OWNER_URL}?action=listings`, {
      headers: { 'X-Authorization': token },
    })
      .then((r) => r.json())
      .then((data) => {
        setListings(Array.isArray(data) ? data : (data.listings ?? []));
      })
      .catch(() => {})
      .finally(() => setListingsLoading(false));
  };

  const fetchStats = (listingId: number) => {
    return fetch(`${OWNER_URL}?action=stats&listing_id=${listingId}`, {
      headers: { 'X-Authorization': token },
    }).then((r) => r.json());
  };

  const fetchLeads = (listingId: number) => {
    return fetch(`${OWNER_URL}?action=leads&listing_id=${listingId}`, {
      headers: { 'X-Authorization': token },
    }).then((r) => r.json());
  };

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectListing = (listing: OwnerListing) => {
    if (listing.status !== 'active') return;
    if (selectedListing?.id === listing.id) {
      setSelectedListing(null);
      setStats(null);
      setLeads([]);
      return;
    }
    setSelectedListing(listing);
    setStats(null);
    setLeads([]);
    setStatsLoading(true);
    Promise.all([fetchStats(listing.id), fetchLeads(listing.id)])
      .then(([statsData, leadsData]) => {
        setStats(statsData.stats ?? statsData ?? null);
        setLeads(Array.isArray(leadsData) ? leadsData : (leadsData.leads ?? []));
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка */}
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-blue flex items-center justify-center">
            <Icon name="Building2" size={16} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-gray-700">Личный кабинет</span>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-gray-600 hidden sm:block">{user.name}</span>
          )}
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Icon name="LogOut" size={16} />
            <span className="hidden sm:block">Выйти</span>
          </button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Приветствие */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Добро пожаловать{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-gray-500 mt-1">Ваши объекты</p>
        </div>

        {/* Список объектов */}
        {listingsLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Icon name="Loader2" size={32} className="animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Icon name="Building2" size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">У вас пока нет добавленных объектов</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => {
              const badge = statusLabel(listing.status);
              const isActive = listing.status === 'active';
              const isSelected = selectedListing?.id === listing.id;

              return (
                <div
                  key={listing.id}
                  onClick={() => handleSelectListing(listing)}
                  className={[
                    'bg-white rounded-2xl p-4 shadow-sm transition-shadow',
                    isActive ? 'cursor-pointer hover:shadow-md' : 'cursor-default',
                    isSelected ? 'ring-2 ring-brand-blue' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex gap-4">
                    {/* Фото */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                      {listing.image ? (
                        <img
                          src={listing.image}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="ImageOff" size={20} className="text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Инфо */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                          {listing.title}
                        </h3>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.className}`}
                        >
                          {badge.text}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{listing.address}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {formatPrice(listing.price, listing.deal)}
                        </span>
                        {listing.area > 0 && (
                          <span className="text-xs text-gray-400">{listing.area} м²</span>
                        )}
                      </div>

                      {/* Просмотры для активных */}
                      {listing.status === 'active' && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <Icon name="Eye" size={12} />
                          <span>{listing.views_site} просмотров</span>
                          {isActive && (
                            <span className="ml-1 text-brand-blue">— нажмите для статистики</span>
                          )}
                        </div>
                      )}

                      {/* Комментарий при отклонении */}
                      {listing.status === 'rejected' && listing.moderation_comment && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                          <span className="font-medium">Причина: </span>
                          {listing.moderation_comment}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Панель статистики */}
        {selectedListing && (
          <div className="mt-4 bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-lg">
                Статистика: {selectedListing.title}
              </h2>
              <button
                onClick={() => {
                  setSelectedListing(null);
                  setStats(null);
                  setLeads([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Icon name="X" size={20} />
              </button>
            </div>

            {statsLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Icon name="Loader2" size={28} className="animate-spin" />
              </div>
            ) : stats ? (
              <>
                {/* Карточки просмотров */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'Сайт', value: stats.views_site, icon: 'Globe' },
                    { label: 'QR-код', value: stats.views_qr, icon: 'QrCode' },
                    { label: 'Авито', value: stats.views_avito, icon: 'ExternalLink' },
                    { label: 'Яндекс', value: stats.views_yandex, icon: 'Search' },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1"
                    >
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Icon name={card.icon} size={14} />
                        <span className="text-xs">{card.label}</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900">{card.value}</span>
                    </div>
                  ))}
                </div>

                {/* Заявки */}
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">
                    Заявки ({leads.length})
                  </h3>
                  {leads.length === 0 ? (
                    <p className="text-sm text-gray-400">Заявок пока нет</p>
                  ) : (
                    <div className="space-y-2">
                      {leads.map((lead) => (
                        <div
                          key={lead.id}
                          className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2.5 flex-wrap"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon name="User" size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-800 truncate">
                              {lead.name}
                            </span>
                            <span className="text-sm text-gray-500">{lead.phone}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-gray-400">
                              {leadStatusLabel(lead.status)}
                            </span>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400">
                              {formatDate(lead.created_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 py-4 text-center">
                Не удалось загрузить статистику
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
