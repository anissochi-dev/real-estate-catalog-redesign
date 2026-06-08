const LS_KEY = 'geo_okrug_providers_config';

export interface GeoProvidersConfig {
  providers: string[];
  limits: Record<string, number>;
}

export function loadGeoConfig(): GeoProvidersConfig {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* ignore */ }
  }
  return { providers: ['yandex', 'maps_co', 'nominatim'], limits: { yandex: 9999, maps_co: 9999, nominatim: 9999 } };
}

export function saveGeoConfig(cfg: GeoProvidersConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}
