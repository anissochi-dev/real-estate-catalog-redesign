import { lazy } from 'react';
import type { ComponentType } from 'react';

function _isChunkError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '');
  return /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg);
}

function _hardReload() {
  try {
    const key = '__chunk_hard_reload_at__';
    const last = Number(sessionStorage.getItem(key) || '0');
    if (Date.now() - last > 20000) {
      sessionStorage.setItem(key, String(Date.now()));
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
    }
  } catch {
    window.location.reload();
  }
}

export function lazyWithRetry<T extends { default: ComponentType<Record<string, unknown>> }>(
  factory: () => Promise<T>,
  retries = 3,
  delay = 400,
) {
  return lazy(() => {
    let attempt = 0;
    const tryLoad = (): Promise<T> =>
      factory().catch((err: unknown) => {
        attempt++;
        if (_isChunkError(err)) {
          if (attempt > retries) {
            // Все попытки исчерпаны — тихо перезагружаем страницу
            _hardReload();
            // Возвращаем пустышку чтобы React не крашил рендер пока идёт reload
            return { default: () => null } as unknown as T;
          }
          return new Promise<T>((resolve, reject) =>
            setTimeout(() => tryLoad().then(resolve, reject), delay * attempt),
          );
        }
        throw err;
      });
    return tryLoad();
  });
}

// Фабрики импортов — переиспользуем их и для lazy-компонента, и для префетча.
const importers = {
  property: () => import('../pages/PropertyPage'),
  catalog: () => import('../pages/CatalogPage'),
  map: () => import('../pages/MapPage'),
  favorites: () => import('../pages/FavoritesPage'),
  compare: () => import('../pages/ComparePage'),
  login: () => import('../pages/LoginPage'),
  networkTenants: () => import('../pages/NetworkTenantsPage'),
  category: () => import('../pages/CategoryPage'),
  district: () => import('../pages/DistrictPage'),
  notFound: () => import('../pages/NotFoundPage'),
  declined: () => import('../pages/DeclinedPage'),
  news: () => import('../pages/NewsPage'),
  leads: () => import('../pages/LeadsListPage'),
  leadDetail: () => import('../pages/leads/LeadDetailPage'),
};

export const PropertyPage       = lazyWithRetry(importers.property);
export const CatalogPage        = lazyWithRetry(importers.catalog);
export const MapPage            = lazyWithRetry(importers.map);
export const FavoritesPage      = lazyWithRetry(importers.favorites);
export const ComparePage        = lazyWithRetry(importers.compare);
export const LoginPage          = lazyWithRetry(importers.login);
export const NetworkTenantsPage = lazyWithRetry(importers.networkTenants);
export const CategoryPage       = lazyWithRetry(importers.category);
export const DistrictPage       = lazyWithRetry(importers.district);
export const NotFoundPage       = lazyWithRetry(importers.notFound);
export const DeclinedPage       = lazyWithRetry(importers.declined);
export const NewsListPage       = lazyWithRetry(() => importers.news().then(m => ({ default: m.NewsListPage })));
export const NewsArticlePage    = lazyWithRetry(() => importers.news().then(m => ({ default: m.NewsArticlePage })));
export const LeadsListPage      = lazyWithRetry(importers.leads);
export const LeadDetailPage     = lazyWithRetry(importers.leadDetail);

// Префетч чанка страницы — вызываем при наведении/касании пункта меню,
// чтобы к моменту клика код страницы уже был загружен (мгновенное открытие).
const prefetched = new Set<string>();
export function prefetchPage(page: string): void {
  const map: Record<string, () => Promise<unknown>> = {
    property: importers.property,
    catalog: importers.catalog,
    map: importers.map,
    favorites: importers.favorites,
    compare: importers.compare,
    news: importers.news,
    leads: importers.leads,
    'network-tenants': importers.networkTenants,
    login: importers.login,
  };
  const fn = map[page];
  if (!fn || prefetched.has(page)) return;
  prefetched.add(page);
  fn().catch(() => prefetched.delete(page));
}