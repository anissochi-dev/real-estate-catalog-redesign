/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { Listing, City, ROAD_LINES } from './types';

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
    // Без load=package.full — карта быстрее грузится, нам нужны только Map, Placemark, geocode/suggest.
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${apiKey ? `&apikey=${apiKey}` : ''}`;
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
  /**
   * Колбэк для отметки "координаты выставлены вручную".
   * Вызывается с true при клике/перетаскивании маркера на карте,
   * с false — при ручном изменении адресной строки или смене города.
   */
  onCoordsManualChange?: (manual: boolean) => void;
}

interface Suggestion {
  value: string;        // что показывать (улица, дом)
  displayName: string;
}

export default function AddressWithMap({ editing, setEditing, cities, hasError, onCoordsManualChange }: AddressProps) {
  const { settings } = useSettings();
  const apiKey = settings.yandex_maps_api_key || '';
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [streetInput, setStreetInput] = useState(editing.address || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCity = editing.city || 'Краснодар';

  // Синхронизация значения поля при изменении адреса извне (например клик по карте)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setStreetInput(editing.address || '');
    }
  }, [editing.address]);

  // Закрытие dropdown при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && e.target !== inputRef.current) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
          onCoordsManualChange?.(true);
          reverseGeocode(coords[0], coords[1]);
        });

        ymapInstance.current.events.add('click', (e: any) => {
          const coords = e.get('coords') as [number, number];
          markerRef.current.geometry.setCoordinates(coords);
          onCoordsManualChange?.(true);
          reverseGeocode(coords[0], coords[1]);
        });

        setMapReady(true);
      })
      .catch(() => { if (!destroyed) setMapError(true); });

    return () => { destroyed = true; ymapInstance.current?.destroy(); ymapInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  /* Подсказки через встроенный ymaps.suggest (часть JS API Карт).
   * Работает с тем же ключом yandex_maps_api_key и НЕ требует отдельного ключа HTTP-геокодера. */
  const fetchSuggestions = (query: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestTimer.current = setTimeout(() => {
      if (!window.ymaps || typeof window.ymaps.suggest !== 'function') {
        setSuggestions([]);
        return;
      }
      const fullQuery = `${currentCity}, ${q}`;
      window.ymaps.suggest(fullQuery, { results: 8 })
        .then((items: any[]) => {
          const list: Suggestion[] = (items || []).map((it) => {
            const raw = it.displayName || it.value || '';
            const cleaned = raw
              .replace(/^Россия,\s*/i, '')
              .replace(new RegExp(`(^|,\\s*)(${currentCity}(\\s+\\(.+?\\))?)(,\\s*|$)`, 'gi'), '$1')
              .replace(/(^|,\s*)(Краснодарский край|[^,]+ область|[^,]+ край|[^,]+ Республика)(,\s*|$)/gi, '$1')
              .replace(/^,\s*/, '')
              .replace(/,\s*,/g, ',')
              .trim();
            return { value: cleaned || raw, displayName: cleaned || raw };
          }).filter((s: Suggestion) => s.value);
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          setHighlightIdx(-1);
        })
        .catch(() => setSuggestions([]));
    }, 250);
  };

  /* Геокодинг по адресной строке через ymaps.geocode (JS API, тот же ключ). */
  function geocodeAddress(fullAddr: string, streetOnly?: string) {
    if (!window.ymaps || typeof window.ymaps.geocode !== 'function') return;
    window.ymaps.geocode(fullAddr, { results: 1 })
      .then((res: any) => {
        const obj = res?.geoObjects?.get(0);
        if (!obj) return;
        const coordsRaw = obj.geometry?.getCoordinates?.();
        if (!coordsRaw || coordsRaw.length !== 2) return;
        const coords: [number, number] = [coordsRaw[0], coordsRaw[1]];
        markerRef.current?.geometry.setCoordinates(coords);
        ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
        parseYmapsGeoObject(obj, coords, streetOnly);
      })
      .catch(() => undefined);
  }

  /* Обратный геокодинг (клик/драг на карте) через ymaps.geocode. */
  function reverseGeocode(lat: number, lng: number) {
    if (!window.ymaps || typeof window.ymaps.geocode !== 'function') return;
    window.ymaps.geocode([lat, lng], { results: 1, kind: 'house' })
      .then((res: any) => {
        const obj = res?.geoObjects?.get(0);
        if (!obj) return;
        parseYmapsGeoObject(obj, [lat, lng]);
      })
      .catch(() => undefined);
  }

  /** Парсер geoObject из ymaps.geocode. Район всегда берём из нового адреса. */
  function parseYmapsGeoObject(obj: any, coords: [number, number], streetOverride?: string) {
    // Район: административная единица уровня района города
    let district = '';
    try {
      const adminAreas = obj.getAdministrativeAreas?.() || [];
      // Последний элемент обычно — район/округ города
      district = (adminAreas.length ? adminAreas[adminAreas.length - 1] : '') || '';
    } catch { /* ignore */ }
    // Запасной способ — через metaData компоненты
    if (!district) {
      try {
        const meta = obj.properties?.get?.('metaDataProperty')?.GeocoderMetaData;
        const comps: { kind: string; name: string }[] = meta?.Address?.Components || [];
        for (const p of comps) {
          if (p.kind === 'district') district = p.name;
        }
      } catch { /* ignore */ }
    }
    const street = obj.getThoroughfare?.() || '';
    const house = obj.getPremiseNumber?.() || '';
    const builtAddress = [street, house].filter(Boolean).join(', ');
    const finalAddress = streetOverride || builtAddress || obj.getAddressLine?.() || '';
    const cur = editingRef.current;
    setEditing({
      ...cur,
      // Район всегда переопределяем новым адресом (пустой — значит для нового адреса район не определён)
      district: district || '',
      address: finalAddress,
      lat: coords[0],
      lng: coords[1],
    });
    setStreetInput(finalAddress);
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

  const pickSuggestion = (s: Suggestion) => {
    setStreetInput(s.value);
    setShowSuggestions(false);
    geocodeAddress(`${currentCity}, ${s.value}`, s.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        pickSuggestion(suggestions[highlightIdx]);
      } else {
        const v = streetInput.trim();
        if (v) {
          setShowSuggestions(false);
          geocodeAddress(`${currentCity}, ${v}`, v);
        }
      }
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
            onChange={e => {
              setStreetInput('');
              onCoordsManualChange?.(false);
              setEditing({ ...editing, city: e.target.value, address: '', lat: null, lng: null });
            }}
          >
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 relative">
          <label className="text-xs text-muted-foreground block mb-1">
            Улица и дом (начните вводить — появятся подсказки)
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              className="w-full px-3 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              placeholder="напр. Красная, 1"
              value={streetInput}
              onChange={e => {
                setStreetInput(e.target.value);
                fetchSuggestions(e.target.value);
                // Адрес поменяли вручную — координаты больше не считаем "ручными",
                // чтобы при сохранении они пересчитались по новому адресу.
                onCoordsManualChange?.(false);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleInputKeyDown}
              onBlur={e => {
                const v = e.target.value.trim();
                // На blur геокодируем только если есть что и адрес ещё не совпадает с сохранённым.
                // Задержка позволяет клику по подсказке сработать первым.
                setTimeout(() => {
                  if (!v) return;
                  if (showSuggestions) return;
                  if (v === (editingRef.current.address || '')) return;
                  geocodeAddress(`${currentCity}, ${v}`, v);
                }, 200);
              }}
            />
            <Icon name="Search" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Кастомный явный dropdown с подсказками */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s.value}-${i}`}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                    i === highlightIdx ? 'bg-brand-blue/10 text-brand-blue' : 'hover:bg-muted'
                  }`}
                >
                  <Icon name="MapPin" size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{s.displayName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing.district && (
        <div className="text-xs text-muted-foreground">
          Район: <span className="font-medium text-foreground">{editing.district}</span>
        </div>
      )}

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Линия расположения</label>
        <select className="w-full sm:w-1/2 px-3 py-2 border rounded-lg text-sm bg-white"
          value={editing.road_line || ''}
          onChange={e => setEditing({ ...editing, road_line: e.target.value })}>
          <option value="">— Не указано —</option>
          {ROAD_LINES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
        </select>
      </div>

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