import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { type Property } from './appTypes';
import { fetchListings, mapApiListing } from '../lib/api';

type PrefetchData = {
  listings: Property[]; total: number;
  settings: Record<string, unknown>; stats: unknown; leadsCount: number;
};

/**
 * Загрузка объектов: prefetch из window.__PREFETCH__, fallback — прямой fetch.
 * Управляет preload LCP-изображения и ленивой догрузкой полного списка.
 */
export function useListings() {
  const location = useLocation();
  const [properties, setProperties] = useState<Property[]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    const w = window as Window & {
      __PREFETCH__?: PrefetchData;
      __PREFETCH_PROMISE__?: Promise<void>;
      __PREFETCH_RESOLVE__?: (d: PrefetchData) => void;
    };

    function applyListings(listings: Property[], total: number) {
      setProperties(listings);
      setError(null);
      setLoading(false);
      const lcpItem = listings[0];
      const lcpSrc = lcpItem?.image;
      if (lcpSrc && !document.querySelector(`link[rel="preload"][href="${lcpSrc}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preload'; link.as = 'image';
        link.href = lcpSrc;
        link.setAttribute('fetchpriority', 'high');
        if (lcpItem?.image_thumb) {
          link.setAttribute('imagesrcset', `${lcpItem.image_thumb} 800w, ${lcpSrc} 1920w`);
          link.setAttribute('imagesizes', '(max-width: 640px) calc(100vw - 32px), (max-width: 768px) calc(50vw - 24px), (max-width: 1024px) calc(33vw - 24px), 300px');
        }
        document.head.appendChild(link);
      }
      const onHome = window.location.pathname === '/';
      if (total > listings.length && !onHome) {
        const loadAll = () => setTimeout(() => fetchListings()
          .then(({ listings: all }) => { setProperties(all); setAllLoaded(true); })
          .catch(() => setAllLoaded(true)), 2000);
        if (document.readyState === 'complete') {
          loadAll();
        } else {
          window.addEventListener('load', loadAll, { once: true });
        }
      } else {
        setAllLoaded(onHome ? false : true);
      }
    }

    if (w.__PREFETCH__) {
      applyListings(w.__PREFETCH__.listings.map(mapApiListing), w.__PREFETCH__.total);
      return;
    }

    if (w.__PREFETCH_PROMISE__) {
      let done = false;
      w.__PREFETCH_RESOLVE__ = (d: PrefetchData) => { done = true; applyListings(d.listings.map(mapApiListing), d.total); };
      const guard = setTimeout(() => {
        if (!done) fetchListings(8, 0)
          .then(({ listings, total }) => applyListings(listings, total))
          .catch(() => { setError('Не удалось загрузить объекты.'); setLoading(false); });
      }, 2000);
      return () => clearTimeout(guard);
    }

    fetchListings(8, 0)
      .then(({ listings, total }) => applyListings(listings, total))
      .catch(err => { console.error(err); setError('Не удалось загрузить объекты.'); setLoading(false); });
  }, []);

  // Страховка от «вечного колеса»
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      fetchListings(8, 0)
        .then(({ listings }) => { setProperties(prev => (prev.length ? prev : listings)); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 3000);
    return () => clearTimeout(t);
  }, [loading]);

  // Ленивая догрузка полного списка при переходе на страницы каталога
  useEffect(() => {
    if (allLoaded) return;
    const path = location.pathname;
    const needsFullList = path === '/catalog'
      || path.startsWith('/catalog/')
      || path === '/favorites'
      || path === '/compare'
      || path === '/search'
      || path === '/map'
      || path === '/network-tenants'
      || path.startsWith('/district/')
      || path.startsWith('/category/');
    if (!needsFullList) return;
    let cancelled = false;
    fetchListings()
      .then(({ listings }) => {
        if (cancelled) return;
        setProperties(listings);
        setAllLoaded(true);
      })
      .catch(() => { if (!cancelled) setAllLoaded(true); });
    return () => { cancelled = true; };
  }, [location.pathname, allLoaded]);

  return { properties, setProperties, allLoaded, setAllLoaded, loading, error };
}