/* eslint-disable @typescript-eslint/no-explicit-any */
import { Listing, City } from './types';

/* ── Яндекс.Карты типы ── */
declare global {
  interface Window {
    ymaps: any;
  }
}

let ymapsLoadPromise: Promise<void> | null = null;
export function loadYmaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.ymaps) return Promise.resolve();
  if (ymapsLoadPromise) return ymapsLoadPromise;
  ymapsLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${apiKey ? `&apikey=${apiKey}` : ''}`;
    s.async = true;
    s.onload = () => window.ymaps ? window.ymaps.ready(() => resolve()) : (ymapsLoadPromise = null, reject());
    s.onerror = () => { ymapsLoadPromise = null; reject(); };
    document.head.appendChild(s);
  });
  return ymapsLoadPromise;
}

export const CITY_CENTERS: Record<string, [number, number]> = {
  'Краснодар':         [45.0355, 38.9753],
  'Сочи':              [43.5855, 39.7231],
  'Анапа':             [44.8943, 37.3164],
  'Геленджик':         [44.5612, 38.0764],
  'Новороссийск':      [44.7235, 37.7686],
  'Армавир':           [44.9892, 41.1304],
  'Москва':            [55.7558, 37.6173],
  'Санкт-Петербург':   [59.9343, 30.3351],
};

export function cityCenter(city?: string): [number, number] {
  if (city && CITY_CENTERS[city]) return CITY_CENTERS[city];
  return CITY_CENTERS['Краснодар'];
}

export interface AddressProps {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  hasError?: boolean;
  districtError?: boolean;
  onCoordsManualChange?: (manual: boolean) => void;
  onEgrnChange?: (objects: import('./types').EgrnStoredObject[]) => void;
}

export interface Suggestion {
  value: string;
  full?: string;
  displayName: string;
  lat?: number | null;
  lon?: number | null;
  district?: string;
}

export interface CadastreObject {
  cadastral_number: string;
  address?: string;
  type?: string;
  area?: string;
}

export interface CadastreInfo {
  found: boolean;
  cadastral_number: string;
  address?: string;
  lat?: number | null;
  lon?: number | null;
  object_type?: string;
  area_sqm?: number | null;
  floor?: number | null;
  floors?: number | null;
  flat_count?: number | null;
  year_built?: number | null;
  sqm_price?: number | null;
  status?: string;
  purpose?: string;
  category?: string;
  district?: string;
  city_district?: string;
  postal_code?: string;
  house_cadnum?: string;
  flat_cadnum?: string;
  stead_cadnum?: string;
  source?: string;
  objects?: CadastreObject[];
}

export interface EgrnData {
  success: number;
  type?: string;
  status?: string;
  ownership?: string;
  cad_number?: string;
  area?: string;
  floor?: string;
  address?: string;
  purpose?: string;
  reg_date?: string;
  cad_cost?: string;
  cad_cost_det_date?: string;
  encumbrances?: { type?: string; reg_number?: string; date?: string }[];
  rights?: { number?: string; date?: string; type?: string }[];
  message?: string;
}

export interface EgrnStat {
  day_used: number;
  day_limit: number;
  month_used: number;
  month_limit: number;
  paid_till: string;
}