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
        loadingPromise = null;
        reject(new Error('NO_YMAPS'));
      }
    };
    s.onerror = () => {
      loadingPromise = null;
      reject(new Error('LOAD_FAILED'));
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

    if (!apiKey) {
      setError('INVALID_KEY');
      return;
    }
    setError(null);

    loadYmapsScript(apiKey).then(() => {
      if (cancelled || !containerRef.current || !window.ymaps) return;
      if (!mapRef.current) {
        try {
          const realCenter: [number, number] = center
            || (points[0] ? [points[0].lat, points[0].lng] : KRASNODAR);
          mapRef.current = new window.ymaps.Map(containerRef.current, {
            center: realCenter,
            zoom,
            controls: ['zoomControl', 'fullscreenControl', 'geolocationControl'],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.toLowerCase().includes('key') || msg.toLowerCase().includes('apikey')) {
            setError('INVALID_KEY');
          } else {
            setError('INIT_FAILED');
          }
        }
      }
    }).catch((e: Error) => {
      if (!cancelled) setError(e.message || 'LOAD_FAILED');
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

    const valid = points
      .map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);

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
    const isKeyError = error === 'INVALID_KEY' || !settings.yandex_maps_api_key;
    return (
      <div
        className={`bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl flex flex-col items-center justify-center text-center px-6 py-8 ${className}`}
        style={{ height }}
      >
        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-3">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div className="font-display font-700 text-base text-foreground mb-1">
          {isKeyError ? 'Карта не настроена' : 'Карта недоступна'}
        </div>
        <div className="text-xs text-muted-foreground max-w-sm">
          {isKeyError
            ? 'Не указан или неверный API-ключ Яндекс.Карт. Добавьте его в админке: Настройки → SEO и аналитика → API-ключ Яндекс.Карт.'
            : 'Не удалось загрузить Яндекс.Карты. Проверьте подключение к интернету.'}
        </div>
        {isKeyError && (
          <a
            href="https://developer.tech.yandex.ru/services/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 text-xs font-semibold text-brand-blue hover:underline"
          >
            Получить ключ Яндекс.Карт →
          </a>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height, width: '100%' }} className={`rounded-xl overflow-hidden ${className}`} />
  );
}