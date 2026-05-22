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
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const fullAddress = [editing.city || 'Краснодар', editing.district, editing.address]
    .filter(Boolean).join(', ');
  const [inputValue, setInputValue] = useState(fullAddress);

  /* Инициализация карты */
  useEffect(() => {
    let destroyed = false;
    loadYmaps(apiKey)
      .then(() => {
        if (destroyed || !mapRef.current) return;
        const center: [number, number] = (editing.lat && editing.lng)
          ? [+editing.lat, +editing.lng]
          : [45.0355, 38.9753];

        ymapInstance.current = new window.ymaps.Map(mapRef.current, {
          center, zoom: editing.lat ? 16 : 11,
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

  /* Suggest (автодополнение) */
  useEffect(() => {
    if (!mapReady || !inputRef.current) return;
    let destroyed = false;
    try {
      suggestRef.current = new window.ymaps.SuggestView(inputRef.current, {
        results: 7,
        boundedBy: ymapInstance.current?.getBounds(),
      });
      suggestRef.current.events.add('select', (e: any) => {
        const value: string = e.get('item').value;
        if (destroyed) return;
        geocodeAddress(value);
      });
    } catch { /* ignore */ }
    return () => {
      destroyed = true;
      try { suggestRef.current?.destroy(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  function geocodeAddress(addr: string) {
    if (!window.ymaps) return;
    window.ymaps.geocode(addr, { results: 1 }).then((res: any) => {
      const obj = res.geoObjects.get(0);
      if (!obj) return;
      const coords: [number, number] = obj.geometry.getCoordinates();
      markerRef.current?.geometry.setCoordinates(coords);
      ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
      parseGeoObject(obj, coords);
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

  function parseGeoObject(obj: any, coords: [number, number]) {
    const meta = obj.properties.get('metaDataProperty.GeocoderMetaData');
    const parts = meta?.Address?.Components || [];
    let city = '', district = '', street = '', house = '';
    for (const p of parts) {
      if (p.kind === 'locality') city = p.name;
      else if (p.kind === 'district') district = p.name;
      else if (p.kind === 'street') street = p.name;
      else if (p.kind === 'house') house = p.name;
    }
    const address = [street, house].filter(Boolean).join(', ');
    setEditing({
      ...editing,
      city: city || editing.city || '',
      district: district || editing.district || '',
      address: address || obj.properties.get('name') || editing.address || '',
      lat: coords[0],
      lng: coords[1],
    });
  }

  useEffect(() => {
    if (!mapReady || !markerRef.current || !editing.lat || !editing.lng) return;
    const coords: [number, number] = [+editing.lat, +editing.lng];
    markerRef.current.geometry.setCoordinates(coords);
    ymapInstance.current?.setCenter(coords, 16);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.lat, editing.lng]);

  // Синхронизируем inputValue когда адрес меняется снаружи (геокодер/reverseGeocode)
  useEffect(() => {
    setInputValue(fullAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.city, editing.district, editing.address]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      geocodeAddress((e.target as HTMLInputElement).value);
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

      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Адрес (начните вводить — появятся подсказки)
        </label>
        <div className="relative">
          <input
            ref={inputRef}
            className="w-full px-3 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            placeholder="Например: Краснодар, ул. Красная, 1"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={e => {
              const v = e.target.value.trim();
              if (v && v !== fullAddress) geocodeAddress(v);
            }}
          />
          <Icon name="Search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Город</label>
          <select className="w-full px-3 py-2 border rounded-lg text-sm" value={editing.city || 'Краснодар'}
            onChange={e => setEditing({ ...editing, city: e.target.value })}>
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Район</label>
          <input className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Центральный"
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Улица и дом</label>
          <input className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="ул. Красная, 1"
            value={editing.address || ''}
            onChange={e => setEditing({ ...editing, address: e.target.value })} />
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 280 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
        {!mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-sm text-muted-foreground gap-2">
            <Icon name="Loader2" size={16} className="animate-spin" /> Загрузка карты...
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 text-sm text-muted-foreground gap-2">
            <Icon name="MapOff" size={20} className="opacity-40" />
            <span>Добавьте API-ключ Яндекс.Карт в Настройки → SEO</span>
          </div>
        )}
        {mapReady && editing.lat && editing.lng && (
          <div className="absolute bottom-2 left-2 bg-white/90 text-[10px] px-2 py-1 rounded-lg text-muted-foreground">
            {(+editing.lat).toFixed(5)}, {(+editing.lng).toFixed(5)}
          </div>
        )}
        {mapReady && (
          <div className="absolute top-2 right-2 bg-white/90 text-[10px] px-2 py-1 rounded-lg text-muted-foreground">
            Кликните на карте или перетащите метку
          </div>
        )}
      </div>
    </div>
  );
}