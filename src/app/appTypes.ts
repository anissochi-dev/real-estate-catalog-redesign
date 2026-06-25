export type PropertyType = 'office' | 'retail' | 'warehouse' | 'restaurant' | 'business' | 'production' | 'hotel' | 'gab';
export type DealType = 'sale' | 'rent' | 'business';

export interface Property {
  id: number;
  title: string;
  type: PropertyType;
  deal: DealType;
  address: string;
  district: string;
  area: number;
  price: number;
  pricePerM2?: number;
  payback?: number;
  profit?: number;
  image: string;
  tags: string[];
  description: string;
  floor?: number;
  totalFloors?: number;
  lat: number;
  lng: number;
  isHot?: boolean;
  isNew?: boolean;
  isExclusive?: boolean;
  isUrgent?: boolean;
  publicCode?: number;
  tenantName?: string;
  monthlyRent?: number;
  yearlyRent?: number;
  purpose?: string;
  finishing?: string;
  ceilingHeight?: number;
  electricityKw?: number;
  utilities?: string;
  roadLine?: string;
  updatedAt?: string;
  createdAt?: string;
  lastEditedAt?: string;
  ownerPhone?: string;
  image_thumb?: string;
}

export type Page = 'home' | 'catalog' | 'map' | 'favorites' | 'compare' | 'network-tenants' | 'news' | 'leads';
export type AppView = 'site' | 'login' | 'admin' | 'client';

export const PATH_BY_PAGE: Record<Page, string> = {
  home: '/',
  catalog: '/catalog',
  map: '/map',
  favorites: '/favorites',
  compare: '/compare',
  'network-tenants': '/network-tenants',
  news: '/news',
  leads: '/leads',
};

export function pageFromPath(pathname: string): Page {
  if (pathname.startsWith('/catalog')) return 'catalog';
  if (pathname.startsWith('/map')) return 'map';
  if (pathname.startsWith('/favorites')) return 'favorites';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/network-tenants')) return 'network-tenants';
  if (pathname.startsWith('/news')) return 'news';
  if (pathname.startsWith('/leads')) return 'leads';
  return 'home';
}

export const VIEW_KEY = 'biznest_view';
// Флаг «сотрудник прямо сейчас работает в админке».
// Ставится только когда реально показывается админ-панель, снимается при выходе.
// Нужен, чтобы при перезагрузке (F5) внутри админки — где в адресной строке
// остаётся публичный путь вроде «/map» — вернуть админку, а не сайт.
export const IN_ADMIN_KEY = 'biznest_in_admin';

export const IN_CLIENT_KEY = 'biznest_in_client';

export function loadInitialView(): AppView {
  try {
    // 1. Если сотрудник работал в админке — восстанавливаем её ПЕРВЫМ ДЕЛОМ
    if (localStorage.getItem(IN_ADMIN_KEY) === '1') return 'admin';

    // 2. Если клиент-собственник работал в кабинете — восстанавливаем
    if (localStorage.getItem(IN_CLIENT_KEY) === '1') return 'client';

    const path = window.location.pathname;

    // 3. Публичные страницы — открываем как сайт
    const publicPaths = ['/object', '/catalog', '/map', '/favorites', '/compare', '/network-tenants', '/news', '/leads', '/declined'];
    if (path === '/' || publicPaths.some(p => path.startsWith(p))) return 'site';

    // 4. Если в localStorage сохранён вид — восстанавливаем его.
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'admin' || v === 'login' || v === 'client') return v;
    if (v === 'site') return v;
  } catch {
    // ignore localStorage errors
  }
  return 'site';
}