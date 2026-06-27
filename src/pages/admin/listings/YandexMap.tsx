/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { loadYmaps, cityCenter } from './cadastreTypes';
import type { Listing } from './types';

interface ReverseResult {
  found: boolean;
  address: string;
  street: string;
  house: string;
  settlement: string;
  district: string;
  lat: number;
  lon: number;
}

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  currentCity: string;
  apiKey: string;
  setStreetInput: (v: string) => void;
  onCoordsManualChange?: (manual: boolean) => void;
  ymapInstance: React.MutableRefObject<any>;
  markerRef: React.MutableRefObject<any>;
  mapRef: React.RefObject<HTMLDivElement>;
  onMapReady: (ready: boolean) => void;
  parseYmapsGeoObject: (obj: any, coords: [number, number], streetOverride?: string) => void;
  parseReverseResult: (data: ReverseResult, coords: [number, number]) => void;
}

export default function YandexMap({
  editing,
  currentCity,
  apiKey,
  onCoordsManualChange,
  ymapInstance,
  markerRef,
  mapRef,
  onMapReady,
  parseReverseResult,
}: Props) {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  function reverseGeocode(lat: number, lng: number) {
    fetch(`https://functions.poehali.dev/9b2f9622-9d12-4809-a614-023af6958251?action=reverse&lat=${lat}&lng=${lng}`)
      .then(r => r.json())
      .then((data: any) => {
        if (!data.found) return;
        parseReverseResult(data, [lat, lng]);
      })
      .catch(() => undefined);
  }

  /* Инициализация карты */
  useEffect(() => {
    let destroyed = false;
    loadYmaps(apiKey)
      .then(() => {
        if (destroyed || !mapRef.current) return;
        const center: [number, number] = (editingRef.current.lat && editingRef.current.lng)
          ? [+editingRef.current.lat, +editingRef.current.lng]
          : cityCenter(currentCity);

        ymapInstance.current = new window.ymaps.Map(mapRef.current, {
          center, zoom: editingRef.current.lat ? 16 : 12,
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
        onMapReady(true);
      })
      .catch(() => { if (!destroyed) setMapError(true); });

    return () => { destroyed = true; ymapInstance.current?.destroy(); ymapInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

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

  return (
    <>
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
    </>
  );
}