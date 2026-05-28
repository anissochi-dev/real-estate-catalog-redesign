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
}

export type Page = 'home' | 'catalog' | 'map' | 'favorites' | 'compare' | 'network-tenants' | 'news' | 'leads';
export type AppView = 'site' | 'login' | 'admin';

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

export function loadInitialView(): AppView {
  try {
    // 1. Если в localStorage сохранён admin/login — приоритет за ним.
    //    Это нужно чтобы при перезагрузке страницы (особенно на мобиле,
    //    где URL не меняется при переходе в админку) пользователь оставался
    //    в админ-панели, а не выкидывался на публичный сайт.
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'admin' || v === 'login') return v;

    // 2. Иначе если URL — публичная страница, открываем сайт.
    const publicPaths = ['/object', '/catalog', '/map', '/favorites', '/compare', '/network-tenants', '/news', '/leads', '/declined'];
    if (publicPaths.some(p => window.location.pathname.startsWith(p))) return 'site';

    // 3. Иначе берём что есть в localStorage (или site по умолчанию).
    if (v === 'site') return v;
  } catch {
    // ignore localStorage errors
  }
  return 'site';
}