/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { ROAD_LINES } from './types';
import { fetchDistricts, District } from '@/lib/api';
import {
  loadYmaps,
  cityCenter,
  AddressProps,
  Suggestion,
  CadastreInfo,
  EgrnData,
  EgrnStat,
} from './cadastreTypes';
import CadastreCard from './CadastreCard';
import EgrnBlock from './EgrnBlock';

const GEO_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';
const EGRN_URL = 'https://functions.poehali.dev/83ef375d-1f72-4f65-8825-10df58a37159';

interface DadataSuggestion { value: string; full: string; lat: number | null; lon: number | null; district?: string; }

export default function AddressWithMap({ editing, setEditing, cities, hasError, districtError, onCoordsManualChange }: AddressProps) {
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
  const [districts, setDistricts] = useState<District[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Кадастр
  const [cadastreInput, setCadastreInput] = useState(editing.cadastral_number || '');
  const [cadastreLoading, setCadastreLoading] = useState(false);
  const [cadastreSearchLoading, setCadastreSearchLoading] = useState(false);
  const [cadastreInfo, setCadastreInfo] = useState<CadastreInfo | null>(
    editing.cadastral_number ? { cadastral_number: editing.cadastral_number, found: true } : null
  );

  // ЕГРН
  const [egrnData, setEgrnData] = useState<EgrnData | null>(null);
  const [egrnStat, setEgrnStat] = useState<EgrnStat | null>(null);
  const [egrnLoading, setEgrnLoading] = useState(false);
  const [egrnError, setEgrnError] = useState<string | null>(null);
  const [egrnOpen, setEgrnOpen] = useState(false);

  async function fetchEgrn(cadNumber: string) {
    setEgrnLoading(true);
    setEgrnError(null);
    setEgrnData(null);
    setEgrnOpen(true);
    try {
      const [detRes, statRes] = await Promise.all([
        fetch(`${EGRN_URL}?action=details&cadNumber=${encodeURIComponent(cadNumber)}`),
        fetch(`${EGRN_URL}?action=stat`),
      ]);
      const det: EgrnData = await detRes.json();
      const stat: EgrnStat = await statRes.json();
      setEgrnData(det);
      setEgrnStat(stat);
      // Автозаполнение площади из ЕГРН — только если поле ещё не заполнено
      if (det.success === 1 && det.area) {
        const areaParsed = parseFloat(det.area);
        if (!isNaN(areaParsed) && areaParsed > 0 && !editingRef.current.area) {
          setEditing({ ...editingRef.current, area: areaParsed });
        }
      }
    } catch {
      setEgrnError('Ошибка при запросе к ЕГРН');
    } finally {
      setEgrnLoading(false);
    }
  }

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

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

  /* Загрузить кадастр по адресу — автозапрос после выбора подсказки */
  const fetchCadastreByAddress = async (fullAddress: string) => {
    if (!fullAddress.trim()) return;
    setCadastreLoading(true);
    try {
      const r = await fetch(`${GEO_URL}?action=cadastre_by_address&query=${encodeURIComponent(fullAddress)}`);
      const d = await r.json();
      if (d.found && d.cadastral_number) {
        setCadastreInfo(d);
        setCadastreInput(d.cadastral_number);
        setEditing({ ...editingRef.current, cadastral_number: d.cadastral_number });
        fetchEgrn(d.cadastral_number);
      }
      // Не сбрасываем пустым — PKK по адресу менее надёжен
    } catch { /* тихо */ }
    finally { setCadastreLoading(false); }
  };

  /* Поиск по кадастровому номеру через бэкенд */
  const searchByCadastre = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setCadastreSearchLoading(true);
    try {
      const r = await fetch(`${GEO_URL}?action=by_cadastre&query=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.found && d.lat) {
        setCadastreInfo(d);
        setCadastreInput(q);
        fetchEgrn(q);
        const coords: [number, number] = [d.lat, d.lon];
        markerRef.current?.geometry.setCoordinates(coords);
        ymapInstance.current?.setCenter(coords, 17, { duration: 400 });
        if (d.address) setStreetInput(d.address);
        onCoordsManualChange?.(true);
        setEditing({
          ...editingRef.current,
          cadastral_number: q,
          ...(d.address ? { address: d.address } : {}),
          lat: d.lat,
          lng: d.lon,
          ...(d.district ? { district: d.district } : {}),
        });
      } else {
        setCadastreInfo({ found: false, cadastral_number: q });
        setEditing({ ...editingRef.current, cadastral_number: q });
      }
    } catch {
      setCadastreInfo({ found: false, cadastral_number: q });
      setEditing({ ...editingRef.current, cadastral_number: q });
    } finally {
      setCadastreSearchLoading(false);
    }
  };

  /* Подсказки адресов через DaData (бэкенд). */
  const fetchSuggestions = (query: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    suggestTimer.current = setTimeout(() => {
      const url = `${GEO_URL}?query=${encodeURIComponent(q)}&city=${encodeURIComponent(currentCity)}`;
      fetch(url)
        .then(r => r.json())
        .then((items: DadataSuggestion[]) => {
          const list: Suggestion[] = (items || [])
            .map(it => {
              return { value: it.value, full: it.full, displayName: it.value, lat: it.lat, lon: it.lon, district: it.district || '' };
            })
            .filter(s => s.value);
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          setHighlightIdx(-1);
        })
        .catch(() => setSuggestions([]));
    }, 250);
  };

  /* Геокодинг по адресной строке через ymaps.geocode */
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

  /** Парсер geoObject из ymaps.geocode. Микрорайон всегда берём из нового адреса. */
  function parseYmapsGeoObject(obj: any, coords: [number, number], streetOverride?: string) {
    let microdistrict = '';
    try {
      const meta = obj.properties?.get?.('metaDataProperty')?.GeocoderMetaData;
      const comps: { kind: string; name: string }[] = meta?.Address?.Components || [];
      const dists = comps.filter(p => p.kind === 'district').map(p => p.name);
      microdistrict = dists.find(n => /микрорайон|мкр|квартал|жилмассив/i.test(n))
        || (dists.length ? dists[dists.length - 1] : '');
    } catch { /* ignore */ }
    if (!microdistrict) {
      try {
        const adminAreas = obj.getAdministrativeAreas?.() || [];
        microdistrict = (adminAreas.length ? adminAreas[adminAreas.length - 1] : '') || '';
      } catch { /* ignore */ }
    }
    const street = obj.getThoroughfare?.() || '';
    const house = obj.getPremiseNumber?.() || '';
    const builtAddress = [street, house].filter(Boolean).join(', ');
    const finalAddress = streetOverride || builtAddress || obj.getAddressLine?.() || '';
    const cur = editingRef.current;
    setEditing({
      ...cur,
      district: microdistrict || '',
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
    if (s.lat && s.lon) {
      const coords: [number, number] = [s.lat, s.lon];
      markerRef.current?.geometry.setCoordinates(coords);
      ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
      setEditing({
        ...editingRef.current,
        address: s.value,
        lat: s.lat,
        lng: s.lon,
        ...(s.district ? { district: s.district } : {}),
      });
    } else {
      geocodeAddress(`${currentCity}, ${s.value}`, s.value);
    }
    // Запрашиваем кадастровый номер по выбранному адресу (full — полный адрес с городом)
    fetchCadastreByAddress(s.full || `${currentCity}, ${s.value}`);
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
                onCoordsManualChange?.(false);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onKeyDown={handleInputKeyDown}
              onBlur={e => {
                const v = e.target.value.trim();
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

      <div>
        <label className="text-xs font-semibold block mb-1">
          Район <span className="text-red-500">*</span>
          {districtError && <span className="ml-2 text-red-500 font-normal">— обязательное поле</span>}
        </label>
        {districts.length > 0 ? (
          <select
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none transition-colors ${districtError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-border focus:border-brand-blue'}`}
          >
            <option value="">— выберите район —</option>
            {districts.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        ) : (
          <input
            value={editing.district || ''}
            onChange={e => setEditing({ ...editing, district: e.target.value })}
            placeholder="Введите район вручную"
            className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${districtError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-border focus:border-brand-blue'}`}
          />
        )}
        <div className="text-xs text-muted-foreground mt-1">
          Определяется автоматически по адресу или выбирается вручную
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Линия расположения</label>
        <select className="w-full sm:w-1/2 px-3 py-2 border rounded-lg text-sm bg-white"
          value={editing.road_line || ''}
          onChange={e => setEditing({ ...editing, road_line: e.target.value })}>
          <option value="">— Не указано —</option>
          {ROAD_LINES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
        </select>
      </div>

      {/* ── Кадастровый поиск ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Кадастровый номер</label>
        <div className="flex gap-2">
          <input
            value={cadastreInput}
            onChange={e => setCadastreInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchByCadastre(cadastreInput); } }}
            placeholder="напр. 23:43:0401001:1234"
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <button
            type="button"
            onClick={() => searchByCadastre(cadastreInput)}
            disabled={cadastreSearchLoading || !cadastreInput.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 transition-colors"
          >
            {cadastreSearchLoading
              ? <Icon name="Loader2" size={14} className="animate-spin" />
              : <Icon name="Search" size={14} />}
            Найти
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          Введите кадастровый номер для поиска объекта на карте и заполнения координат.
          {cadastreLoading && (
            <span className="ml-2 inline-flex items-center gap-1 text-brand-blue">
              <Icon name="Loader2" size={11} className="animate-spin" />
              Запрашиваем кадастр…
            </span>
          )}
        </div>
      </div>

      {/* ── InfoCard кадастра ──────────────────────────────────────────────── */}
      <CadastreCard cadastreInfo={cadastreInfo} />

      {/* ── Блок ЕГРН ────────────────────────────────────────────────────── */}
      {(editing.cadastral_number || cadastreInput) && (
        <EgrnBlock
          cadastralNumber={editing.cadastral_number || cadastreInput}
          egrnData={egrnData}
          egrnStat={egrnStat}
          egrnLoading={egrnLoading}
          egrnError={egrnError}
          egrnOpen={egrnOpen}
          setEgrnOpen={setEgrnOpen}
        />
      )}

      {/* ── Карта ─────────────────────────────────────────────────────────── */}
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
