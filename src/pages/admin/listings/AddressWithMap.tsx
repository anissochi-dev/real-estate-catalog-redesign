/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { fetchDistricts, District } from '@/lib/api';
import {
  AddressProps,
  Suggestion,
  CadastreInfo,
  CadastreObject,
  EgrnData,
  EgrnStat,
} from './cadastreTypes';
import type { EgrnStoredObject } from './types';
import CadastreCard from './CadastreCard';
import EgrnBlock from './EgrnBlock';
import AddressInputRow from './AddressInputRow';
import YandexMap from './YandexMap';

const GEO_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';
const EGRN_URL = GEO_URL; // egrn merged into geo

interface DadataSuggestion { value: string; full: string; lat: number | null; lon: number | null; district?: string; }

export default function AddressWithMap({ editing, setEditing, cities, hasError, districtError, onCoordsManualChange, onEgrnChange }: AddressProps) {
  const { settings } = useSettings();
  const apiKey = settings.yandex_maps_api_key || '';

  const mapRef = useRef<HTMLDivElement>(null);
  const ymapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [streetInput, setStreetInput] = useState(editing.address || '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [districts, setDistricts] = useState<District[]>([]);

  // Кадастр
  const [cadastreInput, setCadastreInput] = useState(editing.cadastral_number || '');
  const [cadastreLoading, setCadastreLoading] = useState(false);
  const [cadastreSearchLoading, setCadastreSearchLoading] = useState(false);
  const [cadastreInfo, setCadastreInfo] = useState<CadastreInfo | null>(
    editing.cadastral_number ? { cadastral_number: editing.cadastral_number, found: true } : null
  );

  // ЕГРН — храним данные по каждому кадастровому номеру отдельно
  const [egrnDataMap, setEgrnDataMap] = useState<Record<string, EgrnData>>({});
  const egrnDataMapRef = useRef<Record<string, EgrnData>>({});
  const [egrnLoadingSet, setEgrnLoadingSet] = useState<Set<string>>(new Set());
  const [egrnStat, setEgrnStat] = useState<EgrnStat | null>(null);
  const [egrnError, setEgrnError] = useState<string | null>(null);
  const [egrnOpen, setEgrnOpen] = useState(false);
  // Объекты для отображения в блоке ЕГРН (может быть несколько)
  const [egrnObjects, setEgrnObjects] = useState<CadastreObject[]>([]);
  const egrnObjectsRef = useRef<CadastreObject[]>([]);

  const currentCity = editing.city || 'Краснодар';

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setStreetInput(editing.address || '');
    }
  }, [editing.address]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && e.target !== inputRef.current) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Собираем EgrnStoredObject[] из текущего dataMap + objects и уведомляем родителя */
  function _notifyEgrnChange(updatedMap: Record<string, EgrnData>, objects: CadastreObject[]) {
    if (!onEgrnChange) return;
    // Берём только объекты с успешно загруженной выпиской
    const stored: EgrnStoredObject[] = objects
      .filter(obj => updatedMap[obj.cadastral_number]?.success === 1 || updatedMap[obj.cadastral_number])
      .map(obj => {
        const det = updatedMap[obj.cadastral_number];
        return {
          cadastral_number: obj.cadastral_number,
          address: obj.address || det?.address,
          type: obj.type || det?.type,
          area: obj.area || det?.area,
          status: det?.status,
          ownership: det?.ownership,
          purpose: det?.purpose,
          floor: det?.floor,
          reg_date: det?.reg_date,
          cad_cost: det?.cad_cost,
          encumbrances: det?.encumbrances?.map(e => ({ type: e.type, date: e.date })),
          rights: det?.rights?.map(r => ({ type: r.type, date: r.date })),
          fetched_at: det ? new Date().toISOString() : undefined,
        };
      })
      .filter(o => o.cadastral_number);
    if (stored.length > 0) onEgrnChange(stored);
  }

  /* Загрузить выписку ЕГРН для одного кадастрового номера */
  async function fetchEgrnOne(cadNumber: string, withStat: boolean) {
    setEgrnLoadingSet(prev => new Set(prev).add(cadNumber));
    try {
      const requests: Promise<Response>[] = [
        fetch(`${EGRN_URL}?action=egrn_details&cadNumber=${encodeURIComponent(cadNumber)}`),
      ];
      if (withStat) requests.push(fetch(`${EGRN_URL}?action=egrn_stat`));
      const results = await Promise.all(requests);
      const det: EgrnData = await results[0].json();
      if (withStat && results[1]) {
        const stat: EgrnStat = await results[1].json();
        setEgrnStat(stat);
      }
      const updatedMap = { ...egrnDataMapRef.current, [cadNumber]: det };
      egrnDataMapRef.current = updatedMap;
      setEgrnDataMap(updatedMap);
      // Уведомляем родителя о новых данных ЕГРН
      _notifyEgrnChange(updatedMap, egrnObjectsRef.current);
      // Автозаполнение площади — только если поле ещё не заполнено
      if (det.success === 1 && det.area) {
        const areaParsed = parseFloat(det.area);
        if (!isNaN(areaParsed) && areaParsed > 0 && !editingRef.current.area) {
          setEditing({ ...editingRef.current, area: areaParsed });
        }
      }
    } catch {
      setEgrnError('Ошибка при запросе к ЕГРН');
    } finally {
      setEgrnLoadingSet(prev => { const s = new Set(prev); s.delete(cadNumber); return s; });
    }
  }

  /* Загрузить выписки для выбранных кадастровых номеров (вызывается из EgrnBlock по кнопке) */
  function fetchEgrnForSelected(cadNumbers: string[]) {
    if (!cadNumbers.length) return;
    setEgrnError(null);
    setEgrnOpen(true);
    cadNumbers.forEach((cn, i) => fetchEgrnOne(cn, i === 0));
  }

  /* Загрузить кадастр по адресу — автозапрос после выбора подсказки */
  const fetchCadastreByAddress = async (fullAddress: string, hintLat?: number | null, hintLon?: number | null) => {
    if (!fullAddress.trim()) return;
    setCadastreLoading(true);
    try {
      let url = `${GEO_URL}?action=cadastre_by_address&query=${encodeURIComponent(fullAddress)}`;
      if (hintLat && hintLon) url += `&hint_lat=${hintLat}&hint_lon=${hintLon}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.found && d.cadastral_number) {
        setCadastreInfo(d);
        setCadastreInput(d.cadastral_number);
        setEditing({ ...editingRef.current, cadastral_number: d.cadastral_number });
        // Сохраняем объекты для выбора, но НЕ грузим выписки автоматически
        const objects: CadastreObject[] = d.objects?.length
          ? d.objects
          : [{ cadastral_number: d.cadastral_number, address: d.address }];
        egrnObjectsRef.current = objects;
        egrnDataMapRef.current = {};
        setEgrnObjects(objects);
        setEgrnDataMap({});
        setEgrnOpen(true);
      }
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
        // Сохраняем объекты, но НЕ грузим выписки автоматически
        const objects: CadastreObject[] = d.objects?.length
          ? d.objects
          : [{ cadastral_number: q, address: d.address }];
        egrnObjectsRef.current = objects;
        egrnDataMapRef.current = {};
        setEgrnObjects(objects);
        setEgrnDataMap({});
        setEgrnOpen(true);
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

  const fetchSuggestions = (query: string) => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const q = query.trim();
    if (!q) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestTimer.current = setTimeout(() => {
      fetch(`${GEO_URL}?query=${encodeURIComponent(q)}&city=${encodeURIComponent(currentCity)}`)
        .then(r => r.json())
        .then((items: DadataSuggestion[]) => {
          const list: Suggestion[] = (items || [])
            .map(it => ({ value: it.value, full: it.full, displayName: it.value, lat: it.lat, lon: it.lon, district: it.district || '' }))
            .filter(s => s.value);
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          setHighlightIdx(-1);
        })
        .catch(() => setSuggestions([]));
    }, 250);
  };

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

  function parseYmapsGeoObject(obj: any, coords: [number, number], streetOverride?: string) {
    let microdistrict = '';
    let settlement = '';
    try {
      const meta = obj.properties?.get?.('metaDataProperty')?.GeocoderMetaData;
      const comps: { kind: string; name: string }[] = meta?.Address?.Components || [];
      // Населённый пункт внутри города (посёлок, станица, хутор и т.д.)
      const localityComp = comps.find(p => p.kind === 'locality');
      const cityComp = comps.find(p => p.kind === 'province' && /город/i.test(p.name));
      // Если locality отличается от основного города — это посёлок/станица
      if (localityComp && localityComp.name !== currentCity && localityComp.name !== cityComp?.name) {
        settlement = localityComp.name;
      }
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
    const builtAddress = [settlement, street, house].filter(Boolean).join(', ');
    const finalAddress = streetOverride || builtAddress || obj.getAddressLine?.() || '';
    const cur = editingRef.current;
    setEditing({ ...cur, district: microdistrict || '', address: finalAddress, lat: coords[0], lng: coords[1] });
    setStreetInput(finalAddress);
  }

  const pickSuggestion = (s: Suggestion) => {
    setStreetInput(s.value);
    setShowSuggestions(false);
    if (s.lat && s.lon) {
      const coords: [number, number] = [s.lat, s.lon];
      markerRef.current?.geometry.setCoordinates(coords);
      ymapInstance.current?.setCenter(coords, 16, { duration: 400 });
      setEditing({ ...editingRef.current, address: s.value, lat: s.lat, lng: s.lon, ...(s.district ? { district: s.district } : {}) });
    } else {
      geocodeAddress(`${currentCity}, ${s.value}`, s.value);
    }
    fetchCadastreByAddress(s.full || `${currentCity}, ${s.value}`, s.lat, s.lon);
  };

  const showEgrnBlock = !!(editing.cadastral_number || cadastreInput);

  return (
    <div className="space-y-3 border-t border-border pt-4" data-field-error={hasError ? 'true' : undefined}>

      {/* ── Город, улица, район, линия ────────────────────────────────────── */}
      <AddressInputRow
        editing={editing}
        setEditing={setEditing}
        cities={cities}
        districts={districts}
        hasError={hasError}
        districtError={districtError}
        currentCity={currentCity}
        streetInput={streetInput}
        setStreetInput={setStreetInput}
        suggestions={suggestions}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
        highlightIdx={highlightIdx}
        setHighlightIdx={setHighlightIdx}
        inputRef={inputRef}
        dropdownRef={dropdownRef}
        onCoordsManualChange={onCoordsManualChange}
        fetchSuggestions={fetchSuggestions}
        pickSuggestion={pickSuggestion}
        geocodeAddress={geocodeAddress}
      />

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
      {showEgrnBlock && (
        <EgrnBlock
          objects={egrnObjects}
          egrnDataMap={egrnDataMap}
          egrnLoadingSet={egrnLoadingSet}
          egrnStat={egrnStat}
          egrnError={egrnError}
          egrnOpen={egrnOpen}
          setEgrnOpen={setEgrnOpen}
          fallbackCadNumber={editing.cadastral_number || cadastreInput}
          onRequestSelected={fetchEgrnForSelected}
        />
      )}

      {/* ── Карта ─────────────────────────────────────────────────────────── */}
      <YandexMap
        editing={editing}
        setEditing={setEditing}
        currentCity={currentCity}
        apiKey={apiKey}
        setStreetInput={setStreetInput}
        onCoordsManualChange={onCoordsManualChange}
        ymapInstance={ymapInstance}
        markerRef={markerRef}
        mapRef={mapRef}
        onMapReady={setMapReady}
        parseYmapsGeoObject={parseYmapsGeoObject}
      />

      {mapReady && null}
    </div>
  );
}