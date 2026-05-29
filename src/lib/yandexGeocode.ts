/**
 * Утилита геокодирования.
 * Сначала пробует встроенный ymaps.geocode (JS API Карт — работает с обычным
 * ключом Карт), а если ymaps недоступен — падает на HTTP Geocoder API
 * (требует отдельный ключ геокодера).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any;

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Распознанные компоненты адреса (если есть). */
  district?: string;
  street?: string;
  house?: string;
  /** Полный текст адреса от геокодера. */
  text?: string;
  /** Адрес в формате "Улица, дом" (если разобрано). */
  shortAddress?: string;
}

/**
 * Геокодирует адрес → координаты + компоненты.
 * Возвращает null, если адрес не распознан или произошла ошибка сети.
 */
export async function geocodeAddress(
  fullAddress: string,
  apiKey?: string,
): Promise<GeocodeResult | null> {
  const q = (fullAddress || '').trim();
  if (!q) return null;

  // 1) Пробуем встроенный ymaps.geocode (тот же ключ, что и у карты)
  if (typeof window !== 'undefined' && window.ymaps && typeof window.ymaps.geocode === 'function') {
    try {
      const res = await window.ymaps.geocode(q, { results: 1 });
      const obj = res?.geoObjects?.get(0);
      if (obj) {
        const coords = obj.geometry?.getCoordinates?.();
        if (coords && coords.length === 2) {
          let district = '';
          try {
            const meta = obj.properties?.get?.('metaDataProperty')?.GeocoderMetaData;
            const comps: { kind: string; name: string }[] = meta?.Address?.Components || [];
            for (const p of comps) { if (p.kind === 'district' && !district) district = p.name; }
          } catch { /* ignore */ }
          const street = obj.getThoroughfare?.() || '';
          const house = obj.getPremiseNumber?.() || '';
          const shortAddress = [street, house].filter(Boolean).join(', ');
          return {
            lat: coords[0],
            lng: coords[1],
            district: district || undefined,
            street: street || undefined,
            house: house || undefined,
            text: obj.getAddressLine?.() || undefined,
            shortAddress: shortAddress || undefined,
          };
        }
      }
    } catch { /* падаем на HTTP-фолбэк ниже */ }
  }

  // 2) Фолбэк: HTTP Geocoder API (требует ключ геокодера)
  const url =
    `https://geocode-maps.yandex.ru/1.x/?format=json&lang=ru_RU&results=1` +
    (apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '') +
    `&geocode=${encodeURIComponent(q)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features: any[] = data?.response?.GeoObjectCollection?.featureMember || [];
    const obj = features[0]?.GeoObject;
    if (!obj) return null;
    const pos: string = obj?.Point?.pos || '';
    const parts = pos.split(' ');
    if (parts.length !== 2) return null;
    const lng = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const meta = obj?.metaDataProperty?.GeocoderMetaData || {};
    const components: { kind: string; name: string }[] = meta?.Address?.Components || [];
    let district = '', street = '', house = '';
    for (const p of components) {
      if (p.kind === 'district' && !district) district = p.name;
      else if (p.kind === 'street' && !street) street = p.name;
      else if (p.kind === 'house' && !house) house = p.name;
    }
    const shortAddress = [street, house].filter(Boolean).join(', ');
    return {
      lat,
      lng,
      district: district || undefined,
      street: street || undefined,
      house: house || undefined,
      text: meta?.text || obj?.name || undefined,
      shortAddress: shortAddress || undefined,
    };
  } catch {
    return null;
  }
}