import { lazy } from 'react';
import type { ComponentType } from 'react';

export function lazyWithRetry<T extends { default: ComponentType<Record<string, unknown>> }>(
  factory: () => Promise<T>,
  retries = 3,
  delay = 600,
) {
  return lazy(() => {
    let attempt = 0;
    const tryLoad = (): Promise<T> =>
      factory().catch((err: Error) => {
        attempt++;
        if (attempt > retries) throw err;
        return new Promise<T>((resolve, reject) => {
          setTimeout(() => tryLoad().then(resolve, reject), delay * attempt);
        });
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
  notFound: () => import('../pages/NotFoundPage'),
  declined: () => import('../pages/DeclinedPage'),
  news: () => import('../pages/NewsPage'),
  leads: () => import('../pages/LeadsListPage'),
};

export const PropertyPage       = lazyWithRetry(importers.property);
export const CatalogPage        = lazyWithRetry(importers.catalog);
export const MapPage            = lazyWithRetry(importers.map);
export const FavoritesPage      = lazyWithRetry(importers.favorites);
export const ComparePage        = lazyWithRetry(importers.compare);
export const LoginPage          = lazyWithRetry(importers.login);
export const NetworkTenantsPage = lazyWithRetry(importers.networkTenants);
export const CategoryPage       = lazyWithRetry(importers.category);
export const NotFoundPage       = lazyWithRetry(importers.notFound);
export const DeclinedPage       = lazyWithRetry(importers.declined);
export const NewsListPage       = lazyWithRetry(() => importers.news().then(m => ({ default: m.NewsListPage })));
export const NewsArticlePage    = lazyWithRetry(() => importers.news().then(m => ({ default: m.NewsArticlePage })));
export const LeadsListPage      = lazyWithRetry(importers.leads);

// Префетч чанка страницы — вызываем при наведении/касании пункта меню,
// чтобы к моменту клика код страницы уже был загружен (мгновенное открытие).
const prefetched = new Set<string>();
export function prefetchPage(page: string): void {
  const map: Record<string, () => Promise<unknown>> = {
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