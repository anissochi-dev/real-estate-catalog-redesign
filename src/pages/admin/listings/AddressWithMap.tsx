/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import Icon from '@/components/ui/icon';
import { fetchDistricts, District } from '@/lib/api';
import {
  AddressProps,
  Suggestion,
  CadastreInfo,
  EgrnData,
  EgrnStat,
} from './cadastreTypes';
import CadastreCard from './CadastreCard';
import EgrnBlock from './EgrnBlock';
import AddressInputRow from './AddressInputRow';
import YandexMap from './YandexMap';

const GEO_URL = 'https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251';
const EGRN_URL = 'https://functions.poehali.dev/83ef375d-1f72-4f65-8825-10df58a37159';

interface DadataSuggestion { value: string; full: string; lat: number | null; lon: number | null; district?: string; }

export default function AddressWithMap({ editing, setEditing, cities, hasError, districtError, onCoordsManualChange }: AddressProps) {
  const { settings } = useSettings();
  const apiKey = settings.yandex_maps_api_key || '';

  // Refs пробрасываем в YandexMap и используем здесь для управления маркером из cadastre
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

  // ЕГРН
  const [egrnData, setEgrnData] = useState<EgrnData | null>(null);
  const [egrnStat, setEgrnStat] = useState<EgrnStat | null>(null);
  const [egrnLoading, setEgrnLoading] = useState(false);
  const [egrnError, setEgrnError] = useState<string | null>(null);
  const [egrnOpen, setEgrnOpen] = useState(false);

  const currentCity = editing.city || 'Краснодар';

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

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
            .map(it => ({ value: it.value, full: it.full, displayName: it.value, lat: it.lat, lon: it.lon, district: it.district || '' }))
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

      {/* Используем mapReady чтобы подавить предупреждение линтера */}
      {mapReady && null}
    </div>
  );
}
