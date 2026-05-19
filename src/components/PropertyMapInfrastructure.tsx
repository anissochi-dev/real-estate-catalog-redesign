import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

interface Props {
  lat: number;
  lng: number;
  title: string;
  address?: string;
}

// Категории инфраструктуры для поиска через ymaps.search
const INFRA_LAYERS = [
  { key: 'transport',    label: 'Транспорт',      icon: '🚌', color: '#2563eb', queries: ['остановка автобус', 'трамвай остановка', 'станция метро'] },
  { key: 'parking',      label: 'Парковки',        icon: '🅿️', color: '#64748b', queries: ['парковка'] },
  { key: 'education',    label: 'Образование',     icon: '🎓', color: '#7c3aed', queries: ['школа', 'детский сад', 'университет', 'колледж', 'детский центр'] },
  { key: 'medicine',     label: 'Медицина',        icon: '🏥', color: '#dc2626', queries: ['поликлиника', 'стоматология', 'медицинский центр', 'аптека'] },
  { key: 'retail',       label: 'Магазины',        icon: '🛒', color: '#ea580c', queries: ['Пятёрочка', 'Магнит', 'ВкусВилл', 'продуктовый магазин', 'аптека', 'банк'] },
  { key: 'food',         label: 'Кафе и рестораны',icon: '☕', color: '#b45309', queries: ['кафе', 'ресторан', 'пекарня', 'кофейня'] },
  { key: 'sport',        label: 'Спорт и красота', icon: '💪', color: '#059669', queries: ['фитнес', 'спортзал', 'салон красоты', 'йога'] },
  { key: 'business',     label: 'Бизнес-центры',   icon: '🏢', color: '#0891b2', queries: ['бизнес-центр', 'коворкинг'] },
  { key: 'government',   label: 'Госучреждения',   icon: '🏛️', color: '#4338ca', queries: ['МФЦ', 'налоговая', 'администрация', 'почта России'] },
  { key: 'leisure',      label: 'Досуг',           icon: '🎭', color: '#db2777', queries: ['парк', 'кинотеатр', 'торговый центр', 'театр'] },
];

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ymaps: any;
  }
}

let loadingPromise: Promise<void> | null = null;
function loadYmaps(apiKey: string): Promise<void> {
  if (window.ymaps) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&load=package.full${apiKey ? `&apikey=${apiKey}` : ''}`;
    s.async = true;
    s.onload = () => window.ymaps ? window.ymaps.ready(() => resolve()) : reject(new Error('NO_YMAPS'));
    s.onerror = () => { loadingPromise = null; reject(new Error('LOAD_FAILED')); };
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export default function PropertyMapInfrastructure({ lat, lng, title, address }: Props) {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionsRef = useRef<Record<string, any>>({});
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Инициализация карты
  useEffect(() => {
    const apiKey = settings.yandex_maps_api_key || '';
    if (!apiKey) { setError('NO_KEY'); return; }
    let cancelled = false;

    loadYmaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      try {
        mapRef.current = new window.ymaps.Map(containerRef.current, {
          center: [lat, lng],
          zoom: 15,
          controls: ['zoomControl', 'fullscreenControl'],
        });

        // Метка самого объекта
        const mark = new window.ymaps.Placemark(
          [lat, lng],
          { balloonContentHeader: title, balloonContentBody: address || '', hintContent: title },
          { preset: 'islands#redDotIconWithCaption', iconCaptionMaxWidth: '200' }
        );
        mapRef.current.geoObjects.add(mark);
        setInitialized(true);
      } catch {
        setError('INIT_FAILED');
      }
    }).catch(() => setError('LOAD_FAILED'));

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.yandex_maps_api_key]);

  // Загрузка / скрытие слоя инфраструктуры
  const toggleLayer = (key: string) => {
    if (!mapRef.current || !window.ymaps) return;

    if (activeLayer === key) {
      // скрываем
      if (collectionsRef.current[key]) {
        mapRef.current.geoObjects.remove(collectionsRef.current[key]);
      }
      setActiveLayer(null);
      return;
    }

    // скрываем предыдущий
    if (activeLayer && collectionsRef.current[activeLayer]) {
      mapRef.current.geoObjects.remove(collectionsRef.current[activeLayer]);
    }
    setActiveLayer(key);

    // Если уже загружали — просто показываем
    if (collectionsRef.current[key]) {
      mapRef.current.geoObjects.add(collectionsRef.current[key]);
      return;
    }

    const layer = INFRA_LAYERS.find(l => l.key === key);
    if (!layer) return;

    setLoading(true);
    const collection = new window.ymaps.GeoObjectCollection();
    const RADIUS = 800; // метров
    const bbox: [[number, number], [number, number]] = [
      [lat - 0.009, lng - 0.013],
      [lat + 0.009, lng + 0.013],
    ];

    Promise.all(
      layer.queries.map(q =>
        window.ymaps.search(q, {
          results: 8,
          boundedBy: bbox,
          strictBounds: true,
          searchControlProvider: 'yandex#search',
        }).then((res: { geoObjects: { toArray: () => unknown[] } }) => {
          res.geoObjects.toArray().forEach((obj: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const o = obj as any;
            const coords = o.geometry?.getCoordinates?.();
            if (!coords) return;

            const dist = Math.round(
              window.ymaps.coordSystem.geo.getDistance([lat, lng], coords)
            );
            if (dist > RADIUS) return;

            const name = o.properties.get('name') || o.properties.get('text') || q;
            const distLabel = dist < 1000 ? `${dist} м` : `${(dist / 1000).toFixed(1)} км`;
            const walkMin = Math.round(dist / 80);

            const placemark = new window.ymaps.Placemark(
              coords,
              {
                hintContent: name,
                balloonContentHeader: `<b>${name}</b>`,
                balloonContentBody:
                  `<div style="font-size:12px;color:#555;line-height:1.6">` +
                  `${layer.icon} <b>${layer.label}</b><br>` +
                  `📍 ${distLabel} от объекта` +
                  (walkMin > 0 ? ` · 🚶 ${walkMin} мин` : '') +
                  `</div>`,
              },
              {
                preset: 'islands#circleIcon',
                iconColor: layer.color,
              }
            );
            collection.add(placemark);
          });
        }).catch(() => null)
      )
    ).finally(() => {
      collectionsRef.current[key] = collection;
      if (mapRef.current) mapRef.current.geoObjects.add(collection);
      setLoading(false);
    });
  };

  if (error === 'NO_KEY') {
    return (
      <div className="rounded-xl bg-muted flex items-center justify-center h-40 text-sm text-muted-foreground text-center px-4">
        Карта не настроена. Добавьте API-ключ Яндекс.Карт в Настройки.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Фильтры слоёв */}
      <div className="flex flex-wrap gap-1.5">
        {INFRA_LAYERS.map(layer => (
          <button
            key={layer.key}
            onClick={() => initialized && toggleLayer(layer.key)}
            disabled={!initialized}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all duration-150
              ${activeLayer === layer.key
                ? 'text-white border-transparent shadow-sm'
                : 'border-border text-muted-foreground hover:border-current hover:text-foreground'
              }
              ${!initialized ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
            style={activeLayer === layer.key ? { backgroundColor: layer.color, borderColor: layer.color } : {}}
          >
            <span>{layer.icon}</span>
            {layer.label}
          </button>
        ))}
        {loading && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2">
            <span className="w-3 h-3 border-2 border-brand-blue/30 border-t-brand-blue rounded-full animate-spin" />
            Загрузка...
          </span>
        )}
      </div>

      {/* Карта */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-border"
        style={{ height: '380px', width: '100%' }}
      />

      {activeLayer && (
        <div className="text-[11px] text-muted-foreground">
          Показаны объекты в радиусе ~800 м. Нажмите на маркер для подробностей.
        </div>
      )}
    </div>
  );
}