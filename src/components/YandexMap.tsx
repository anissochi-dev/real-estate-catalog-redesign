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
  image?: string;
  image_thumb?: string;
  address?: string;
  area?: number;
  price?: number;
  deal?: string;
}

// UX для пожилых пользователей (65+): единый спокойный стиль пина вместо 12 разноцветных
// категорий — глаз не устаёт различать цвета, все объекты воспринимаются как «то, что искал».
// Контурный (не залитый) маркер: белая заливка + приглушённый синий контур (opacity ~0.85).
//
// Этап 2 — увеличенная зона нажатия: сам рисунок пина остаётся 32×40, но SVG-канвас на
// 8px шире с каждой стороны (прозрачные поля). iconImageSize указывается по канвасу целиком,
// поэтому Яндекс.Карты регистрируют клик по всей увеличенной области, а не только по видимому
// контуру — так пожилым пользователям проще попасть пальцем/курсором, а внешний вид не меняется.
const PIN_PAD = 8;
const PIN_VISUAL_W = 32;
const PIN_VISUAL_H = 40;
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_VISUAL_W + PIN_PAD * 2}" height="${PIN_VISUAL_H + PIN_PAD * 2}" viewBox="0 0 ${PIN_VISUAL_W + PIN_PAD * 2} ${PIN_VISUAL_H + PIN_PAD * 2}">`
  + `<g transform="translate(${PIN_PAD},${PIN_PAD})">`
  + '<path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24C32 7.163 24.837 0 16 0z" '
  + 'fill="#FFFFFF" stroke="#4A76BD" stroke-width="2.5" stroke-opacity="0.85"/>'
  + '<circle cx="16" cy="16" r="5" fill="#4A76BD" fill-opacity="0.85"/></g></svg>';
const PIN_ICON_HREF = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PIN_SVG)}`;
const PIN_SIZE: [number, number] = [PIN_VISUAL_W + PIN_PAD * 2, PIN_VISUAL_H + PIN_PAD * 2];
const PIN_OFFSET: [number, number] = [-(PIN_VISUAL_W / 2 + PIN_PAD), -(PIN_VISUAL_H + PIN_PAD)];
// При наведении на карточку в списке (или выборе на карте) — крупнее И другого цвета
// (насыщенный оранжевый вместо приглушённого синего), чтобы пользователю было сразу видно,
// какому объекту в списке соответствует пин на карте — это отдельный, легко читаемый сигнал.
const PIN_SVG_HL = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_VISUAL_W + PIN_PAD * 2}" height="${PIN_VISUAL_H + PIN_PAD * 2}" viewBox="0 0 ${PIN_VISUAL_W + PIN_PAD * 2} ${PIN_VISUAL_H + PIN_PAD * 2}">`
  + `<g transform="translate(${PIN_PAD},${PIN_PAD})">`
  + '<path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 24 16 24s16-13 16-24C32 7.163 24.837 0 16 0z" '
  + 'fill="#F97316" stroke="#C2410C" stroke-width="2.5"/>'
  + '<circle cx="16" cy="16" r="5" fill="#FFFFFF"/></g></svg>';
const PIN_ICON_HREF_HL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PIN_SVG_HL)}`;
const PIN_SCALE_HL = 1.25;
const PIN_SIZE_HL: [number, number] = [Math.round(PIN_SIZE[0] * PIN_SCALE_HL), Math.round(PIN_SIZE[1] * PIN_SCALE_HL)];
const PIN_OFFSET_HL: [number, number] = [Math.round(PIN_OFFSET[0] * PIN_SCALE_HL), Math.round(PIN_OFFSET[1] * PIN_SCALE_HL)];

// Кластер — мягкий пастельный круг с жирной чёрной цифрой (контраст для слабого зрения).
const CLUSTER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">'
  + '<circle cx="20" cy="20" r="18" fill="#DCEAFB" stroke="#93C5FD" stroke-width="2"/></svg>';
const CLUSTER_ICON_HREF = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(CLUSTER_SVG)}`;

interface Props {
  points?: MapPoint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onPointClick?: (point: MapPoint) => void;
  className?: string;
  highlightedId?: number | null;
  selectedId?: number | null;
  onBalloonClose?: () => void;
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
  highlightedId = null,
  selectedId = null,
  onBalloonClose,
}: Props) {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placemarkMapRef = useRef<Map<number, any>>(new Map());
  const pointDataMapRef = useRef<Map<number, MapPoint>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clustererRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlightMarkerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const apiKey = settings.yandex_maps_api_key || '';
    let cancelled = false;

    if (!apiKey) {
      setError('NO_KEY');
      return;
    }
    setError(null);

    // Перехватываем ошибки Яндекс.Карт (домен не привязан, неверный ключ и т.д.)
    const origConsoleError = console.error;
    let ymapsErrorMsg = '';
    console.error = (...args: unknown[]) => {
      const text = args.map(a => String(a)).join(' ');
      if (text.toLowerCase().includes('apikey') || text.toLowerCase().includes('api key') || text.toLowerCase().includes('ymaps')) {
        ymapsErrorMsg = text;
      }
      origConsoleError.apply(console, args);
    };

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
          setMapReady(true);
          // Проверяем через 2 секунды — не вылетела ли ошибка от Яндекса
          setTimeout(() => {
            if (!cancelled && ymapsErrorMsg) {
              const m = ymapsErrorMsg.toLowerCase();
              if (m.includes('referer') || m.includes('domain') || m.includes('домен')) {
                setError('DOMAIN_NOT_ALLOWED');
              } else if (m.includes('apikey') || m.includes('api key') || m.includes('forbidden') || m.includes('403')) {
                setError('INVALID_KEY');
              }
            }
            // Перехватчик больше не нужен — возвращаем оригинал.
            console.error = origConsoleError;
          }, 2000);
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
      // ВАЖНО: восстанавливаем оригинальный console.error.
      // Иначе при каждом заходе на карту обёртки накапливаются и замедляют весь сайт.
      console.error = origConsoleError;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.yandex_maps_api_key]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.ymaps || !mapReady) return;

    const valid = points
      .map(p => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);

    placemarkMapRef.current.clear();
    pointDataMapRef.current.clear();

    // Кластеризация (Этап 1 UX 65+): вместо "муравейника" из десятков пинов при отдалении —
    // один пастельный круг с крупной цифрой. Единственный объект на карте — сам Clusterer,
    // поэтому карту не чистим через geoObjects.removeAll() (это удалило бы и сам Clusterer) —
    // просто очищаем его содержимое при каждом обновлении точек.
    if (!clustererRef.current) {
      clustererRef.current = new window.ymaps.Clusterer({
        preset: 'islands#invertedVioletClusterIcons', // переопределяется layout ниже
        groupByCoordinates: false,
        clusterDisableClickZoom: false,
        clusterHideIconOnBalloonOpen: false,
        geoObjectHideIconOnBalloonOpen: false,
        clusterIconLayout: window.ymaps.templateLayoutFactory.createClass(
          `<div style="position:relative;width:40px;height:40px">
             <img src="${CLUSTER_ICON_HREF}" width="40" height="40" style="position:absolute;top:0;left:0" />
             <div style="position:absolute;top:0;left:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#111;font-family:inherit">$[properties.geoObjects.length]</div>
           </div>`
        ),
        clusterIconShape: { type: 'Circle', coordinates: [20, 20], radius: 20 },
      });
      map.geoObjects.add(clustererRef.current);
    } else {
      clustererRef.current.removeAll();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPlacemarks: any[] = [];

    // Уникальный префикс для обработчиков кликов по balloon
    const cbKey = `_ymapsCb_${Date.now()}`;

    valid.forEach(p => {
      const fmtPrice = (price?: number, deal?: string) => {
        if (!price) return '';
        if (deal === 'rent') {
          return price >= 1000000
            ? `${(price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1)} млн ₽/мес`
            : `${Math.round(price / 1000)} тыс ₽/мес`;
        }
        return price >= 1000000
          ? `${(price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1)} млн ₽`
          : `${Math.round(price / 1000)} тыс ₽`;
      };

      const priceStr = fmtPrice(p.price, p.deal);
      const areaStr = p.area ? `${p.area} м²` : '';
      const cbName = `${cbKey}_${p.id}`;

      // Регистрируем глобальный колбэк для клика по ссылке внутри balloon
      if (p.url) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)[cbName] = () => { window.location.assign(p.url!); };
      }

      const balloonBody = `
        <div onclick="if(window['${cbName}'])window['${cbName}']()" style="display:flex;gap:10px;align-items:flex-start;cursor:${p.url ? 'pointer' : 'default'};min-width:220px;max-width:280px">
          ${p.image ? `<img src="${p.image_thumb || p.image}" style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0" alt="${p.title || ''}"/>` : ''}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:#111;line-height:1.3;margin-bottom:4px">${p.title || ''}</div>
            ${p.address ? `<div style="font-size:11px;color:#888;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.address}</div>` : ''}
            <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
              ${priceStr ? `<span style="font-size:16px;font-weight:700;color:#1a56db">${priceStr}</span>` : ''}
              ${areaStr ? `<span style="font-size:11px;color:#888">· ${areaStr}</span>` : ''}
            </div>
          </div>
        </div>`;

      // Единый спокойный контурный пин (Этап 1 UX 65+) вместо 12 разноцветных категорий.
      // iconImageSize намеренно больше визуальной SVG-картинки — увеличивает зону нажатия
      // для пользователей, которым сложно точно попасть пальцем/курсором.
      const placemark = new window.ymaps.Placemark(
        [p.lat, p.lng],
        {
          balloonContent: balloonBody,
          hintContent: p.title || '',
        },
        {
          iconLayout: 'default#image',
          iconImageHref: PIN_ICON_HREF,
          iconImageSize: PIN_SIZE,
          iconImageOffset: PIN_OFFSET,
          balloonAutoPan: true,
          balloonCloseButton: true,
          hideIconOnBalloonOpen: false,
        }
      );

      placemark.events.add('click', () => {
        if (onPointClick) onPointClick(p);
      });

      newPlacemarks.push(placemark);
      placemarkMapRef.current.set(p.id, placemark);
      pointDataMapRef.current.set(p.id, p);
    });

    clustererRef.current.add(newPlacemarks);

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
  }, [points, center, zoom, onPointClick, mapReady]);

  // Открытие balloon над маркером при выборе
  useEffect(() => {
    if (!mapReady || !window.ymaps) return;
    const map = mapRef.current;
    if (!map) return;

    if (selectedId == null) {
      map.balloon.close();
      return;
    }

    const pm = placemarkMapRef.current.get(selectedId);
    if (pm) {
      pm.balloon.open();
      // Подписываемся на закрытие balloon пользователем
      const handler = () => { if (onBalloonClose) onBalloonClose(); };
      pm.balloon.events.add('close', handler);
      return () => { try { pm.balloon.events.remove('close', handler); } catch { /* ignore */ } };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mapReady]);

  // Подсветка маркера при hover из списка — крупнее и другого цвета (оранжевый),
  // чтобы было сразу понятно, где на карте находится наведённый объект из списка.
  //
  // Важно: при большом количестве объектов в одной точке/районе Яндекс.Карты группируют
  // пины в кластер (кружок с цифрой типа «17», «36») — сам Placemark внутри кластера
  // не отрисовывается на карте, поэтому смена его iconImageHref/Size невидима глазу.
  // Решение: рисуем ОТДЕЛЬНЫЙ маркер-указатель поверх карты (вне Clusterer, добавлен
  // напрямую в map.geoObjects) — он не зависит от кластеризации и всегда виден.
  useEffect(() => {
    if (!mapReady || !window.ymaps) return;
    const map = mapRef.current;
    if (!map) return;

    // Убираем предыдущий указатель
    if (highlightMarkerRef.current) {
      try { map.geoObjects.remove(highlightMarkerRef.current); } catch { /* ignore */ }
      highlightMarkerRef.current = null;
    }

    if (highlightedId == null) return;
    const p = pointDataMapRef.current.get(highlightedId);
    if (!p) return;

    try {
      const marker = new window.ymaps.Placemark(
        [p.lat, p.lng],
        {},
        {
          iconLayout: 'default#image',
          iconImageHref: PIN_ICON_HREF_HL,
          iconImageSize: PIN_SIZE_HL,
          iconImageOffset: PIN_OFFSET_HL,
          zIndex: 1000,
          interactivityModel: 'default#transparent', // клики проходят "сквозь" — не мешает кластеру/пину под собой
        }
      );
      map.geoObjects.add(marker);
      highlightMarkerRef.current = marker;
    } catch { /* ignore */ }
  }, [highlightedId, mapReady, points]);

  // Ресайз карты при смене fullscreen (нативный Fullscreen API)
  useEffect(() => {
    const handler = () => {
      if (mapRef.current) {
        try { mapRef.current.container.fitToViewport(); } catch { /* ignore */ }
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

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
        clustererRef.current = null;
        highlightMarkerRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  if (error) {
    let title = 'Карта недоступна';
    let body = 'Не удалось загрузить Яндекс.Карты. Проверьте подключение к интернету.';
    const showLink = error === 'NO_KEY' || error === 'INVALID_KEY' || error === 'DOMAIN_NOT_ALLOWED';

    if (error === 'NO_KEY') {
      title = 'Карта не настроена';
      body = 'Не указан API-ключ Яндекс.Карт. Добавьте его в админке: Настройки → SEO и аналитика → API-ключ Яндекс.Карт.';
    } else if (error === 'INVALID_KEY') {
      title = 'Неверный API-ключ';
      body = 'Ключ отклонён Яндексом. Проверьте, что вы создали ключ именно для сервиса «JavaScript API и HTTP Геокодер» и он активирован (статус «Подключён»).';
    } else if (error === 'DOMAIN_NOT_ALLOWED') {
      title = 'Домен не разрешён';
      body = `Ключ существует, но текущий домен (${typeof window !== 'undefined' ? window.location.hostname : ''}) не добавлен в список разрешённых HTTP Referer в кабинете Яндекса.`;
    }

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
        <div className="font-display font-700 text-base text-foreground mb-1">{title}</div>
        <div className="text-xs text-muted-foreground max-w-sm">{body}</div>
        {showLink && (
          <a
            href="https://developer.tech.yandex.ru/services/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 text-xs font-semibold text-brand-blue hover:underline"
          >
            Открыть кабинет разработчика Яндекса →
          </a>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ height, width: '100%' }} className={`rounded-xl overflow-hidden ${className}`} />
  );
}