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
  };
}

export async function fetchListings(): Promise<Property[]> {
  const res = await fetch(LISTINGS_URL);
  if (!res.ok) throw new Error('Не удалось загрузить объекты');
  const data = await res.json();
  return (data.listings || []).map(mapListing);
}

export async function fetchSimilarListings(id: number): Promise<Property[]> {
  try {
    const res = await fetch(`${LISTINGS_URL}?resource=similar&id=${id}`);
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
  videoUrl?: string;
  videoType?: string;
  ownerName?: string;
  ownerPhone?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export async function fetchListingById(id: number): Promise<ListingDetail | null> {
  try {
    const res = await fetch(`${LISTINGS_URL}?id=${id}`);
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
      videoUrl: it.video_url,
      videoType: it.video_type,
      ownerName: it.owner_name,
      ownerPhone: it.owner_phone,
      seoTitle: it.seo_title,
      seoDescription: it.seo_description,
    };
  } catch {
    return null;
  }
}

export interface LeadInput {
  name: string;
  phone: string;
  email?: string;
  message?: string;
  listing_id?: number;
  source?: string;
  object_url?: string;
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
}

export async function fetchPublicSettings(): Promise<PublicSettings> {
  try {
    const res = await fetch(`${LISTINGS_URL}?resource=public_settings`);
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

export async function aiMatch(prompt: string): Promise<AiMatchResult> {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'match', prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка ИИ-подбора');
  return {
    listings: data.listings || [],
    reasoning: data.reasoning || '',
    advice: data.advice || '',
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