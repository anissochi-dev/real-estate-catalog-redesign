import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title?: string;
  caption?: string;
  url?: string;
  type?: string;
  isHot?: boolean;
}

// Соответствие типа объекта → preset иконки Yandex Maps (со значком категории)
// Доступные значки: Office, Shopping, Food, Hotel, Factory, Money, Education и др.
const TYPE_PRESET: Record<string, { glyph: string; color: string }> = {
  office: { glyph: 'Office', color: 'blue' },
  retail: { glyph: 'Shopping', color: 'orange' },
  warehouse: { glyph: 'Factory', color: 'grey' },
  restaurant: { glyph: 'Food', color: 'red' },
  hotel: { glyph: 'Hotel', color: 'pink' },
  business: { glyph: 'Money', color: 'violet' },
  gab: { glyph: 'Money', color: 'green' },
  production: { glyph: 'Factory', color: 'darkOrange' },
};

function presetFor(type?: string, isHot?: boolean): string {
  const t = type ? TYPE_PRESET[type] : undefined;
  const color = isHot ? 'red' : (t?.color || 'blue');
  const glyph = t?.glyph || 'Home';
  return `islands#${color}${glyph}Icon`;
}

interface Props {
  points?: MapPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onPointClick?: (point: MapPoint) => void;
  className?: string;
}

const KRASNODAR: [number, number] = [45.0355, 38.9753];

let loadingPromise: Promise<void> | null = null;

function loadYmapsScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.ymaps) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    const key = apiKey ? `&apikey=${apiKey}` : '';
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full${key}`;
    s.async = true;
    s.onload = () => {
      if (window.ymaps) {
        window.ymaps.ready(() => resolve());
      } else {
        reject(new Error('ymaps не инициализирован'));
      }
    };
    s.onerror = () => {
      loadingPromise = null;
      reject(new Error('Не удалось загрузить Яндекс.Карты'));
    };
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export default function YandexMap({
  points = [],
  center,
  zoom = 11,
  height = '500px',
  onPointClick,
  className = '',
}: Props) {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = settings.yandex_maps_api_key || '';
    let cancelled = false;

    loadYmapsScript(apiKey).then(() => {
      if (cancelled || !containerRef.current || !window.ymaps) return;
      if (!mapRef.current) {
        const realCenter: [number, number] = center
          || (points[0] ? [points[0].lat, points[0].lng] : KRASNODAR);
        mapRef.current = new window.ymaps.Map(containerRef.current, {
          center: realCenter,
          zoom,
          controls: ['zoomControl', 'fullscreenControl', 'geolocationControl'],
        });
      }
    }).catch((e: Error) => {
      if (!cancelled) setError(e.message || 'Ошибка карты');
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.yandex_maps_api_key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.ymaps) return;
    map.geoObjects.removeAll();

    const valid = points.filter(p =>
      typeof p.lat === 'number' && typeof p.lng === 'number' && !isNaN(p.lat) && !isNaN(p.lng)
    );

    valid.forEach(p => {
      const placemark = new window.ymaps.Placemark(
        [p.lat, p.lng],
        {
          balloonContentHeader: p.title || '',
          balloonContentBody: p.caption || '',
          hintContent: p.title || '',
        },
        { preset: presetFor(p.type, p.isHot) }
      );
      if (onPointClick || p.url) {
        placemark.events.add('click', () => {
          if (onPointClick) onPointClick(p);
          else if (p.url) window.location.assign(p.url);
        });
      }
      map.geoObjects.add(placemark);
    });

    if (valid.length === 1) {
      map.setCenter([valid[0].lat, valid[0].lng], Math.max(zoom, 14));
    } else if (valid.length > 1) {
      try {
        const bounds = map.geoObjects.getBounds();
        if (bounds) {
          map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
        }
      } catch {
        if (center) map.setCenter(center, zoom);
      }
    } else if (center) {
      map.setCenter(center, zoom);
    }
  }, [points, center, zoom, onPointClick]);

  useEffect(() => {
    const ref = mapRef;
    return () => {
      if (ref.current) {
        try {
          ref.current.destroy();
        } catch {
          // ignore destroy errors
        }
        ref.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div className={`bg-muted rounded-xl flex items-center justify-center text-sm text-muted-foreground ${className}`}
           style={{ height }}>
        Карта временно недоступна
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height, width: '100%' }} className={`rounded-xl overflow-hidden ${className}`} />
  );
}