import { LISTINGS_URL, mapApiListing, type ApiListing, type PublicSettings } from '@/lib/api';
import type { Property } from '@/app/appTypes';

// Публичные GET-данные для loader'ов: те же 3 запроса, что раньше делал
// ранний prefetch-скрипт в index.html. Таймаут — чтобы зависший backend
// не задерживал отдачу страницы: при ошибке страница догрузит данные в браузере.
async function getJson(url: string, timeoutMs = 4000): Promise<Record<string, unknown>> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return {};
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return {};
  } finally {
    clearTimeout(t);
  }
}

export interface SiteData {
  listings: Property[];
  total: number;
  settings: PublicSettings;
}

export async function loadSiteData(): Promise<SiteData> {
  const [l, s] = await Promise.all([
    getJson(`${LISTINGS_URL}?limit=8&offset=0`),
    getJson(`${LISTINGS_URL}?resource=public_settings`),
  ]);
  const raw = Array.isArray(l.listings) ? (l.listings as ApiListing[]) : [];
  return {
    listings: JSON.parse(JSON.stringify(raw.map(mapApiListing))) as Property[],
    total: typeof l.total === 'number' ? l.total : 0,
    settings: (s.settings as PublicSettings) || {},
  };
}

export interface HomeStats {
  total: number;
  main_city: string;
  by_category?: Record<string, number>;
  by_deal?: Record<string, number>;
}

export async function loadHomeStats(): Promise<HomeStats | null> {
  const d = await getJson(`${LISTINGS_URL}?resource=public_home_data`);
  const st = d.stats as Partial<HomeStats> | undefined;
  if (!st) return null;
  return {
    total: st.total || 0,
    main_city: st.main_city || 'Краснодар',
    by_category: st.by_category || {},
    by_deal: st.by_deal || {},
  };
}
