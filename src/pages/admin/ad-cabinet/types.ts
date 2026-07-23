export const CIAN_API_URL = 'https://functions.poehali.dev/3655e748-2c8d-4998-adba-1cf7aed0eee4';

export interface PlatformCard {
  key: string;
  label: string;
  icon: string;
  color: string; // tailwind классы для фона иконки
  connected: boolean;
  offersCount: number;
  balance: number | null;
  status: 'active' | 'paused' | 'not_connected';
  services: { label: string; count: number }[];
}

export interface CianCallRow {
  external_id: number;
  source_phone: string;
  duration: number;
  status: string;
  call_datetime: string;
}

export interface CianServiceRow {
  offer_id: number;
  service_type: string;
  price: string | number;
  paid_till: string | null;
  auto_prolong: boolean;
}

export interface CianOfferRow {
  id: number;
  external_id: number | null;
  status: string;
  source: string;
  url: string | null;
  creation_date: string | null;
  title: string | null;
  slug: string | null;
  category: string | null;
  deal: string | null;
  price: number | null;
  image: string | null;
  add_to_favorites: number;
  calls: number;
  chats: number;
  phone_shows: number;
  responses: number;
  views: number;
  services: CianServiceRow[];
  calls_list: CianCallRow[];
}

export interface CianData {
  ok: boolean;
  last_sync: { synced_at?: string; offers_count?: number; stats_count?: number; services_count?: number; calls_count?: number };
  balance: { total_balance?: string | number; bonuses_amount?: string | number; auction_points_amount?: string | number; synced_at?: string };
  summary: {
    offers_count: number;
    published_count: number;
    total_views: number;
    total_calls: number;
    total_favorites: number;
    services_by_type: Record<string, number>;
  };
  offers: CianOfferRow[];
  synced_now?: boolean;
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  FreeObject: 'Бесплатная публикация',
  DebitObject: 'Платная публикация',
  PremiumObject: 'Премиум размещение',
  Top3: 'Топ-3',
  Highlight: 'Выделение цветом',
  calltracking: 'Подмена номера (Calltracking)',
  cplCalltracking: 'CPL Calltracking',
  XmlImport: 'Выгрузка через XML',
  auction: 'Аукцион',
  demand: 'Спрос+',
  demandPackage: 'Пакет спроса',
  StatusPro: 'Статус ПРО',
  ServicePackageActivation: 'Массовый пакет',
  SubscriptionForPackage: 'Абонентская плата за пакет',
};

export const OFFER_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  published: { label: 'Опубликован', cls: 'bg-emerald-100 text-emerald-700' },
  inactive: { label: 'Неактивен', cls: 'bg-gray-100 text-gray-500' },
  refusedByModerator: { label: 'Отклонён модерацией', cls: 'bg-red-100 text-red-700' },
  removedByModerator: { label: 'Удалён модерацией', cls: 'bg-red-100 text-red-700' },
};
