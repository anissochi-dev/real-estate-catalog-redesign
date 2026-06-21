import type { Property } from '@/App';

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';
const LEADS_URL = 'https://functions.poehali.dev/45673fe4-a39d-4193-b529-174d4c8c8f97';

interface ApiListing {
  id: number;
  title: string;
  description: string;
  category: string;
  deal: string;
  price: number;
  price_per_m2: number | null;
  area: number;
  payback: number | null;
  profit: number | null;
  floor: number | null;
  total_floors: number | null;
  address: string;
  district: string;
  lat: number | string | null;
  lng: number | string | null;
  image: string;
  tags: string[];
  is_hot: boolean;
  is_new: boolean;
  is_exclusive?: boolean;
  is_urgent?: boolean;
  public_code?: number | null;
  tenant_name?: string | null;
  monthly_rent?: number | null;
  yearly_rent?: number | null;
  purpose?: string | null;
  finishing?: string | null;
  ceiling_height?: number | null;
  electricity_kw?: number | null;
  utilities?: string | null;
  road_line?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  last_edited_at?: string | null;
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapListing(item: ApiListing): Property {
  return {
    id: item.id,
    title: item.title,
    type: item.category as Property['type'],
    deal: item.deal as Property['deal'],
    address: item.address,
    district: item.district,
    area: item.area,
    price: item.price,
    pricePerM2: item.price_per_m2 ?? undefined,
    payback: item.payback ?? undefined,
    profit: item.profit ?? undefined,
    floor: item.floor ?? undefined,
    totalFloors: item.total_floors ?? undefined,
    image: item.image,
    tags: item.tags || [],
    description: item.description,
    lat: toNum(item.lat),
    lng: toNum(item.lng),
    isHot: item.is_hot,
    isNew: item.is_new,
    isExclusive: item.is_exclusive,
    isUrgent: item.is_urgent,
    publicCode: item.public_code ?? undefined,
    tenantName: item.tenant_name ?? undefined,
    monthlyRent: item.monthly_rent ?? undefined,
    yearlyRent: item.yearly_rent ?? undefined,
    purpose: item.purpose ?? undefined,
    finishing: item.finishing ?? undefined,
    ceilingHeight: item.ceiling_height ?? undefined,
    electricityKw: item.electricity_kw ?? undefined,
    utilities: item.utilities ?? undefined,
    roadLine: item.road_line ?? undefined,
    updatedAt: item.updated_at ?? undefined,
    createdAt: item.created_at ?? undefined,
    lastEditedAt: item.last_edited_at ?? undefined,
  };
}

/** fetch с таймаутом — зависший запрос не держит спиннер бесконечно. */
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 12000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** fetch с retry на сетевые сбои (без XHR-fallback — он ломал ИИ-запросы из-за CORS). */
async function fetchWithRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, init);
    } catch (e) {
      lastErr = e;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      await new Promise(r => setTimeout(r, 300 + i * 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Network error');
}

export async function fetchListings(limit?: number, offset?: number): Promise<{ listings: Property[]; total: number }> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const url = params.size ? `${LISTINGS_URL}?${params}` : LISTINGS_URL;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error('Не удалось загрузить объекты');
  const data = await res.json();
  return { listings: (data.listings || []).map(mapListing), total: data.total ?? 0 };
}

export async function fetchSimilarListings(id: number): Promise<Property[]> {
  try {
    const res = await fetchWithTimeout(`${LISTINGS_URL}?resource=similar&id=${id}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.listings || []).map(mapListing);
  } catch {
    return [];
  }
}

export interface ListingDetail extends Property {
  images?: string[];
  city?: string;
  priceUnit?: string;
  purpose?: string;
  condition?: string;
  parking?: string;
  entrance?: string;
  propertyRights?: string;
  landStatus?: string;
  landArea?: number | null;
  landVri?: string;
  videoUrl?: string;
  videoType?: string;
  ownerName?: string;
  ownerPhone?: string;
  seoTitle?: string;
  seoDescription?: string;
  rooms?: number | null;
  seoH1?: string | null;
  seoH2?: string | null;
  seoH3?: string | null;
  seoH4?: string | null;
  seoH5?: string | null;
  seoFaq?: { question: string; answer: string }[] | null;
}

// Кэш деталей объекта — заполняется при префетче (наведение на карточку),
// чтобы страница объекта открывалась мгновенно без ожидания сети.
const listingDetailCache = new Map<number, ListingDetail | null>();
const listingDetailInflight = new Map<number, Promise<ListingDetail | null>>();

/** Префетч деталей объекта (без ожидания результата) — вызывать при наведении на карточку. */
export function prefetchListingById(id: number): void {
  if (listingDetailCache.has(id) || listingDetailInflight.has(id)) return;
  const p = fetchListingById(id).catch(() => null);
  listingDetailInflight.set(id, p);
}

export async function fetchListingById(id: number): Promise<ListingDetail | null> {
  if (listingDetailCache.has(id)) return listingDetailCache.get(id) ?? null;
  const existing = listingDetailInflight.get(id);
  if (existing) return existing;

  const run = (async (): Promise<ListingDetail | null> => {
    try {
      const res = await fetchWithTimeout(`${LISTINGS_URL}?id=${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const it = data.listing;
      if (!it) return null;
      const base = mapListing(it);
      const imgs: string[] = (() => {
        if (Array.isArray(it.images)) return it.images;
        if (typeof it.images === 'string' && it.images) {
          const sep = it.images.includes('|') ? '|' : ',';
          return it.images.split(sep).map((s: string) => s.trim()).filter(Boolean);
        }
        return base.image ? [base.image] : [];
      })();
      return {
        ...base,
        images: imgs,
        city: it.city || 'Краснодар',
        priceUnit: it.price_unit,
        purpose: it.purpose,
        condition: it.condition,
        parking: it.parking,
        entrance: it.entrance,
        propertyRights: it.property_rights,
        landStatus: it.land_status,
        landArea: it.land_area ?? null,
        landVri: it.land_vri,
        videoUrl: it.video_url,
        videoType: it.video_type,
        ownerName: it.owner_name,
        ownerPhone: it.owner_phone,
        seoTitle: it.seo_title,
        seoDescription: it.seo_description,
        rooms: it.rooms ?? null,
        seoH1: it.seo_h1 ?? null,
        seoH2: it.seo_h2 ?? null,
        seoH3: it.seo_h3 ?? null,
        seoH4: it.seo_h4 ?? null,
        seoH5: it.seo_h5 ?? null,
        seoFaq: (() => {
          const raw = it.seo_faq;
          if (!raw) return null;
          if (Array.isArray(raw)) return raw;
          try { return JSON.parse(raw); } catch { return null; }
        })(),
      };
    } catch {
      return null;
    }
  })();

  listingDetailInflight.set(id, run);
  const result = await run;
  listingDetailInflight.delete(id);
  // Кэшируем только успешный результат — null не кэшируем, чтобы повторить попытку позже.
  if (result) listingDetailCache.set(id, result);
  return result;
}

export interface LeadInput {
  name: string;
  phone: string;
  email?: string;
  message?: string;
  listing_id?: number;
  source?: string;
  object_url?: string;
  captcha_token?: string;
}

export async function sendLead(payload: LeadInput): Promise<{ success: boolean; id?: number; error?: string }> {
  const res = await fetch(LEADS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export interface PublicSettings {
  company_name?: string;
  company_phone?: string;
  company_email?: string;
  company_address?: string;
  hero_title?: string;
  hero_subtitle?: string;
  about_text?: string;
  home_seo_text?: string;
  logo_url?: string;
  main_city?: string;
  yandex_maps_api_key?: string;
  yandex_metrika_id?: string;
  google_analytics_id?: string;
  company_since_year?: number;
  site_url?: string;
  seo_keywords?: string;
  seo_description?: string;
  legal_personal_data?: string;
  legal_privacy_policy?: string;
  legal_marketing_consent?: string;
  footer_description?: string;
  footer_catalog_links?: string;
  footer_extra_links?: string;
  footer_legal_info?: string;
  watermark_url?: string;
  watermark_enabled?: boolean;
  watermark_position?: string;
  watermark_opacity?: number;
  home_listings_limit?: number;
  catalog_page_size?: number;
  news_list_limit?: number;
  category_page_size?: number;
  leads_page_size?: number;
  show_news_on_home?: boolean;
  home_news_limit?: number;
  show_leads_on_home?: boolean;
  home_leads_limit?: number;
  yandex_webmaster_verification?: string;
  google_search_console_verification?: string;
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  try {
    const res = await fetchWithRetry(`${LISTINGS_URL}?resource=public_settings`);
    const data = await res.json();
    return data.settings || {};
  } catch {
    return {};
  }
}

const AI_URL = 'https://functions.poehali.dev/34bfc4a2-89b9-4c89-bcbc-d82314730aef';

export interface AiMatchListing {
  id: number;
  title: string;
  category: string;
  deal: string;
  price: number;
  area: number;
  district: string;
  address: string;
  payback: number | null;
  profit: number | null;
  image: string;
}

export interface AiMatchResult {
  listings: AiMatchListing[];
  reasoning: string;
  advice: string;
}

export async function aiMatch(
  prompt: string,
  history?: { role: string; text: string }[]
): Promise<AiMatchResult> {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'match', prompt, history: history || [] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка ИИ-подбора');
  return {
    listings: data.listings || [],
    reasoning: data.reasoning || '',
    advice: data.advice || '',
  };
}

/** ИИ-поиск по заявкам клиентов. Возвращает id подходящих заявок. */
export async function aiSearchLeads(prompt: string): Promise<{ ids: number[]; reasoning: string }> {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search_leads', prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка ИИ-поиска заявок');
  return {
    ids: Array.isArray(data.ids) ? data.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n)) : [],
    reasoning: data.reasoning || '',
  };
}

/** Тип публичной заявки. */
export interface PublicLead {
  id: number;
  name: string;
  message: string;
  budget: number | null;
  company: string | null;
  request_category: string | null;
  lead_type: string | null;
  created_at: string;
}

/** Получить полный список публичных заявок. */
export async function fetchPublicLeads(params: {
  page?: number;
  limit?: number;
  search?: string;
  ids?: number[];
  min_budget?: number;
  max_budget?: number;
  category?: string;
  sort?: 'newest' | 'budget_desc' | 'budget_asc';
} = {}): Promise<{ leads: PublicLead[]; total: number; page: number; pages: number }> {
  const qs = new URLSearchParams();
  qs.set('resource', 'public_leads_full');
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.ids && params.ids.length) qs.set('ids', params.ids.join(','));
  if (params.min_budget) qs.set('min_budget', String(params.min_budget));
  if (params.max_budget) qs.set('max_budget', String(params.max_budget));
  if (params.category) qs.set('category', params.category);
  if (params.sort) qs.set('sort', params.sort);
  const res = await fetch(`${LISTINGS_URL}?${qs.toString()}`);
  if (!res.ok) throw new Error('Не удалось загрузить заявки');
  const data = await res.json();
  return {
    leads: Array.isArray(data.leads) ? data.leads : [],
    total: Number(data.total) || 0,
    page: Number(data.page) || 1,
    pages: Number(data.pages) || 1,
  };
}

export interface Agent {
  id: number;
  name: string;
  phone: string | null;
  avatar: string | null;
  role: string;
}

export async function fetchAgents(): Promise<Agent[]> {
  try {
    const res = await fetch(`${LISTINGS_URL}?resource=agents`);
    const data = await res.json();
    return data.agents || [];
  } catch {
    return [];
  }
}

export interface District {
  id: number;
  name: string;
  slug: string;
  city: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  listings_count?: number;
}

const _districtsCache = new Map<string, District[]>();

export async function fetchDistricts(city?: string): Promise<District[]> {
  const key = city || '__all__';
  if (_districtsCache.has(key)) return _districtsCache.get(key)!;
  try {
    const params = city ? `?resource=districts&city=${encodeURIComponent(city)}` : '?resource=districts';
    const res = await fetchWithTimeout(`${LISTINGS_URL}${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const list: District[] = data.districts || [];
    _districtsCache.set(key, list);
    return list;
  } catch {
    return [];
  }
}