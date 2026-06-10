export const GEO_FIX_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';

export const OSM_BATCH = 20;
export const GEO_OKRUG_BATCHES = [30, 50, 70, 90, 110, 150, 200];

export const ALL_PROVIDERS = [
  { id: 'yandex',    label: 'Яндекс' },
  { id: 'dadata',    label: 'DaData' },
  { id: 'maps_co',   label: 'maps.co' },
  { id: 'nominatim', label: 'Nominatim' },
];

export type GeoOkrugResult = {
  total_streets: number; matched_count: number; not_found_count: number;
  results: { street: string; okrug: string | null; suburb: string; city_district: string; provider: string | null }[];
  provider_stats: Record<string, number>;
  provider_limits_remaining: Record<string, number>;
};

export type GeoFixResult = {
  changed_count: number; unchanged_count: number; not_found_count: number;
  changed: { id: number; address: string; district_old: string; district_new: string }[];
};

export type StreetItem = { street: string; base: string };
export type OsmMeta = { osm_total: number; in_map: number; missing_count: number };
