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

export const PropertyPage       = lazyWithRetry(() => import('../pages/PropertyPage'));
export const CatalogPage        = lazyWithRetry(() => import('../pages/CatalogPage'));
export const MapPage            = lazyWithRetry(() => import('../pages/MapPage'));
export const FavoritesPage      = lazyWithRetry(() => import('../pages/FavoritesPage'));
export const ComparePage        = lazyWithRetry(() => import('../pages/ComparePage'));
export const LoginPage          = lazyWithRetry(() => import('../pages/LoginPage'));
export const NetworkTenantsPage = lazyWithRetry(() => import('../pages/NetworkTenantsPage'));
export const CategoryPage       = lazyWithRetry(() => import('../pages/CategoryPage'));
export const NotFoundPage       = lazyWithRetry(() => import('../pages/NotFoundPage'));
export const DeclinedPage       = lazyWithRetry(() => import('../pages/DeclinedPage'));
export const NewsListPage       = lazyWithRetry(() => import('../pages/NewsPage').then(m => ({ default: m.NewsListPage })));
export const NewsArticlePage    = lazyWithRetry(() => import('../pages/NewsPage').then(m => ({ default: m.NewsArticlePage })));
export const LeadsListPage      = lazyWithRetry(() => import('../pages/LeadsListPage'));
