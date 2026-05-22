/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, City } from './types';

/* ── Яндекс.Карты типы ── */
declare global {
  interface Window {
    ymaps: any;
  }
}

let ymapsLoadPromise: Promise<void> | null = null;
function loadYmaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.ymaps) return Promise.resolve();
  if (ymapsLoadPromise) return ymapsLoadPromise;
  ymapsLoadPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full${apiKey ? `&apikey=${apiKey}` : ''}`;
    s.async = true;
    s.onload = () => window.ymaps ? window.ymaps.ready(() => resolve()) : (ymapsLoadPromise = null, reject());
    s.onerror = () => { ymapsLoadPromise = null; reject(); };
    document.head.appendChild(s);
  });
  return ymapsLoadPromise;
}

/* Координаты центра города по умолчанию */
const CITY_CENTERS: Record<string, [number, number]> = {
  'Краснодар':         [45.0355, 38.9753],
  'Сочи':              [43.5855, 39.7231],
  'Анапа':             [44.8943, 37.3164],
  'Геленджик':         [44.5612, 38.0764],
  'Новороссийск':      [44.7235, 37.7686],
  'Армавир':           [44.9892, 41.1304],
  'Москва':            [55.7558, 37.6173],
  'Санкт-Петербург':   [59.9343, 30.3351],
};

function cityCenter(city?: string): [number, number] {
  if (city && CITY_CENTERS[city]) return CITY_CENTERS[city];
  return CITY_CENTERS['Краснодар'];
}

interface AddressProps {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
  hasError?: boolean;
}

export default function AddressWithMap({ editing, setEditing, cities, hasError }: AddressProps) {
  const { settings } = useSettings();
  const apiKey = settings.yandex_maps_api_key || '';
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const suggestRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const currentCity = editing.city || 'Краснодар';

  // Синхронизируем значение поля улицы извне (когда меняется адрес через клик по карте)
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = editing.address || '';
    }
  }, [editing.address]);

  /* Инициализация карты */
  useEffect(() => {
    let destroyed = false;
    loadYmaps(apiKey)
      .then(() => {
        if (destroyed || !mapRef.current) return;
        const center: [number, number] = (editing.lat && editing.lng)
          ? [+editing.lat, +editing.lng]
          : cityCenter(currentCity);

        ymapInstance.current = new window.ymaps.Map(mapRef.current, {
          center, zoom: editing.lat ? 16 : 12,
          controls: ['zoomControl'],
        });

        markerRef.current = new window.ymaps.Placemark(center, {}, {
          preset: 'islands#blueCircleDotIcon',
          draggable: true,
        });
        ymapInstance.current.geoObjects.add(markerRef.current);

        markerRef.current.events.add('dragend', () => {
          const coords = markerRef.current.geometry.getCoordinates();
          reverseGeocode(coords[0], coords[1]);
        });

        ymapInstance.current.events.add('click', (e: any) => {
          const coords = e.get('coords') as [number, number];
          markerRef.current.geometry.setCoordinates(coords);
          reverseGeocode(coords[0], coords[1]);
        });

        setMapReady(true);
      })
      .catch(() => { if (!destroyed) setMapError(true); });

    return () => { destroyed = true; ymapInstance.current?.destroy(); ymapInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  /* Suggest для улиц (с привязкой к городу) */
  useEffect(() => {
    if (!mapReady || !inputRef.current) return;
    // Уничтожаем старый suggest при смене города
    try { suggestRef.current?.destroy(); } catch { /* ignore */ }
    suggestRef.current = null;

    let destroyed = false;
    try {
      // Привязываем подсказки к городу — Яндекс будет искать только в его пределах
      suggestRef.current = new window.ymaps.SuggestView(inputRef.current, {
        results: 7,
        provider: {
          suggest: (req: string) => {
            return window.ymaps.suggest(`${currentCity}, ${req}`).then((items: any[]) => {
              // Удаляем дублирование города из подсказок — показываем только улицу и дом
              return items.map(it => {
                const cleaned = (it.displayName || it.value || '')
                  .replace(new RegExp(`^${currentCity},\\s*`), '')
                  .replace(/^Россия,\s*[^,]+,\s*/, '');
                return { value: cleaned, displayName: cleaned };
              });
            });
          },
        },
      });
      suggestRef.current.events.add('select', (e: any) => {
        const value: string = e.get('item').value;
        if (destroyed) return;
        if (inputRef.current) inputRef.current.value = value;
        // Геокодируем полный адрес = город + введённая улица
        geocodeAddress(`${currentCity}, ${value}`, value);
      });
    } catch { /* ignore */ }

    return () => {
      destroyed = true;
      try { suggestRef.current?.destroy(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, currentCity]);

  function geocodeAddress(fullAddr: string, streetOnly?: string) {
    if (!window.ymaps) return;
    window.ymaps.geocode(fullAddr, { results: 1 }).then((res: any) => {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      const coords: [number, number] = obj.geometry.getCoordinates();
      markerRef.current?.geometry.setCoordinates(coords);
      ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
      parseGeoObject(obj, coords, streetOnly);
    });
  }

  function reverseGeocode(lat: number, lng: number) {
    if (!window.ymaps) return;
    window.ymaps.geocode([lat, lng], { results: 1 }).then((res: any) => {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      parseGeoObject(obj, [lat, lng]);
    });
  }

  function parseGeoObject(obj: any, coords: [number, number], streetOverride?: string) {
    const meta = obj.properties.get('metaDataProperty.GeocoderMetaData');
    const parts = meta?.Address?.Components || [];
    let district = '', street = '', house = '';
    for (const p of parts) {
      if (p.kind === 'district') district = p.name;
      else if (p.kind === 'street') street = p.name;
      else if (p.kind === 'house') house = p.name;
    }
    const builtAddress = [street, house].filter(Boolean).join(', ');
    const finalAddress = streetOverride || builtAddress || obj.properties.get('name') || '';
    const cur = editingRef.current;
    setEditing({
      ...cur,
      // Город НЕ перезаписываем — он управляется только селектом выше
      district: district || cur.district || '',
      address: finalAddress,
      lat: coords[0],
      lng: coords[1],
    });
  }

  /* При смене координат снаружи — обновляем маркер */
  useEffect(() => {
    if (!mapReady || !markerRef.current || !editing.lat || !editing.lng) return;
    const coords: [number, number] = [+editing.lat, +editing.lng];
    markerRef.current.geometry.setCoordinates(coords);
    ymapInstance.current?.setCenter(coords, 16);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.lat, editing.lng]);

  /* При смене города — центрируем карту на нём (если ещё нет координат объекта) */
  useEffect(() => {
    if (!mapReady || !ymapInstance.current) return;
    if (editing.lat && editing.lng) return;
    const c = cityCenter(currentCity);
    ymapInstance.current.setCenter(c, 12, { duration: 400 });
    markerRef.current?.geometry.setCoordinates(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCity, mapReady]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) geocodeAddress(`${currentCity}, ${v}`, v);
    }
  };

  return (
    <div className="space-y-3 border-t border-border pt-4" data-field-error={hasError ? 'true' : undefined}>
      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
        <Icon name="MapPin" size={15} className="text-brand-blue" />
        Расположение
        {hasError && (
          <span className="text-xs font-normal text-red-600 flex items-center gap-1">
            <Icon name="AlertCircle" size={12} />
            Укажите расположение объекта *
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Город</label>
          <select
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
            value={currentCity}
            onChange={e => setEditing({ ...editing, city: e.target.value, address: '', lat: null, lng: null })}
          >
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground block mb-1">
            Улица и дом (начните вводить — появятся подсказки)
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              className="w-full px-3 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="напр. Красная, 1"
              defaultValue={editing.address || ''}
              onKeyDown={handleInputKeyDown}
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== (editing.address || '')) geocodeAddress(`${currentCity}, ${v}`, v);
              }}
            />
            <Icon name="Search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {editing.district && (
        <div className="text-xs text-muted-foreground">
          Район: <span className="font-medium text-foreground">{editing.district}</span>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 280 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-sm text-muted-foreground">
            <Icon name="Loader2" size={16} className="animate-spin mr-2" />
            Загрузка карты...
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-sm text-red-700 px-4 text-center">
            Не удалось загрузить Яндекс.Карты. Проверьте API-ключ в настройках.
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Клик по карте или перетаскивание маркера обновят адрес автоматически.
      </div>
    </div>
  );
}
