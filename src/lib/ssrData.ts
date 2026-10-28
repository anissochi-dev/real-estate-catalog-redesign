import { LISTINGS_URL, mapApiListing, mapListingDetail, type ApiListing, type PublicSettings, type ListingDetail, type District } from '@/lib/api';
import { NEWS_URL } from '@/lib/adminApi';
import { getOkrugChildNames, matchesDistrictNames } from '@/lib/districts';
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

// ── Страницы с данными для поисковиков: объект, статья, район ──────────────
// Без модульных кешей: loader выполняется на сервере для всех посетителей.

type Fetched = { ok: true; data: Record<string, unknown> } | { ok: false; notFound: boolean };

async function getJsonStatus(url: string, timeoutMs = 5000): Promise<Fetched> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (r.status === 404) return { ok: false, notFound: true };
    if (!r.ok) return { ok: false, notFound: false };
    return { ok: true, data: (await r.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, notFound: false };
  } finally {
    clearTimeout(t);
  }
}

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Объект по id. notFound — объекта точно нет (настоящий 404); item=null без notFound —
 *  сбой сети: страница догрузит объект в браузере, как раньше. */
export async function loadListingPage(id: number): Promise<{ item: ListingDetail | null; notFound: boolean }> {
  const r = await getJsonStatus(`${LISTINGS_URL}?id=${id}`);
  if (!r.ok) return { item: null, notFound: r.notFound };
  const it = r.data.listing;
  if (!it) return { item: null, notFound: true };
  return { item: plain(mapListingDetail(it)), notFound: false };
}

export interface NewsArticle {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  image_url?: string;
  source_name?: string;
  category?: string;
  published_at?: string;
  updated_at?: string;
  created_at: string;
  content?: string;
  seo_h1?: string | null;
  seo_h2?: string | null;
  seo_h3?: string | null;
  seo_h4?: string | null;
  seo_h5?: string | null;
  source_url?: string | null;
}

export async function loadNewsArticle(slug: string): Promise<{ article: NewsArticle | null; notFound: boolean }> {
  const r = await getJsonStatus(`${NEWS_URL}?action=get&slug=${encodeURIComponent(slug)}`);
  if (!r.ok) return { article: null, notFound: r.notFound };
  const a = r.data.article as NewsArticle | undefined;
  if (!a) return { article: null, notFound: true };
  return { article: plain(a), notFound: false };
}

export interface DistrictPageData {
  district: District | null;
  allDistricts: District[];
  listings: Property[];
  loaded: boolean;
}

/** Район/округ и его объекты — тот же отбор, что делает страница в браузере. */
export async function loadDistrictPage(slug: string): Promise<DistrictPageData & { notFound: boolean }> {
  const [d, l] = await Promise.all([
    getJsonStatus(`${LISTINGS_URL}?resource=districts`),
    getJsonStatus(LISTINGS_URL, 8000),
  ]);
  if (!d.ok) return { district: null, allDistricts: [], listings: [], loaded: false, notFound: false };
  const all = (Array.isArray(d.data.districts) ? d.data.districts : []) as District[];
  const district = all.find(x => x.slug === slug) || null;
  if (!district) return { district: null, allDistricts: all, listings: [], loaded: false, notFound: true };
  if (!l.ok) return { district, allDistricts: plain(all), listings: [], loaded: false, notFound: false };
  const raw = Array.isArray(l.data.listings) ? (l.data.listings as ApiListing[]) : [];
  const names = district.is_okrug ? getOkrugChildNames(all, district) : [district.name];
  const listings = names.length
    ? raw.map(mapApiListing).filter(p => matchesDistrictNames(p.district, p.address, names))
    : [];
  return { district: plain(district), allDistricts: plain(all), listings: plain(listings), loaded: true, notFound: false };
}

export const SITE_ORIGIN = 'https://bmn.su';

export function clipText(s: string, max: number): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

/** Заголовок карточки объекта: «Название — цена — район» (один и тот же на сервере и в браузере). */
export function listingPageTitle(item: { title: string; price?: number; deal?: string; district?: string }): string {
  // Разряды пробелом вручную: toLocaleString на сервере и в браузере может дать разные пробелы.
  const price = item.price
    ? `${String(Math.round(item.price)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽${item.deal === 'rent' ? '/мес' : ''}`
    : '';
  return [item.title.trim(), price, item.district].filter(Boolean).join(' — ');
}

function countLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} объект`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} объекта`;
  return `${n} объектов`;
}

/** Title и description страницы района/округа — одинаковые для сервера (head) и браузера (SeoHead). */
export function districtSeo(d: { name: string; is_okrug?: boolean }, count: number | null, city = 'Краснодар') {
  // Названия округов в именительном падеже («Центральный округ») — не склоняем, ставим через двоеточие.
  const place = d.is_okrug ? `${d.name}, ${city}` : `район ${d.name}, ${city}`;
  const title = d.is_okrug
    ? `Коммерческая недвижимость: ${place}${count ? ` — ${countLabel(count)}` : ''}`
    : `Коммерческая недвижимость в районе ${d.name}, ${city}${count ? ` — ${countLabel(count)}` : ''}`;
  const description = count
    ? `${countLabel(count)} коммерческой недвижимости — ${place}: аренда и продажа офисов, складов, торговых площадей. Актуальные цены и фото.`
    : `Аренда и продажа коммерческой недвижимости — ${place}. Офисы, склады, торговые площади и другие объекты.`;
  return { title, description };
}
