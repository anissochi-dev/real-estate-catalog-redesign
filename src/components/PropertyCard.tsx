import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';
import YandexMap from '@/components/YandexMap';
import { useSettings } from '@/contexts/SettingsContext';
import { prefetchListingById } from '@/lib/api';
import { prefetchPage } from '@/app/lazyPages';
import { fmtListingId } from '@/lib/formatPrice';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PropertyCardProps {
  property: Property & { images?: string | string[] };
  isFavorite: boolean;
  isCompare: boolean;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  style?: React.CSSProperties;
  index?: number;
}

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Магазин/торговое', warehouse: 'Склад',
  restaurant: 'Общепит', business: 'Готовый бизнес', production: 'Производство',
  hotel: 'Гостиница', gab: 'ГАБ', land: 'Земля', building: 'Здание',
  free_purpose: 'Своб. назнач.', car_service: 'Автосервис',
};

const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Бизнес',
};

const DEAL_COLORS: Record<string, string> = {
  sale: 'bg-brand-blue text-white',
  rent: 'bg-emerald-500 text-white',
  business: 'bg-violet-600 text-white',
};

export function formatPrice(price: number, deal: string): string {
  const fmtMln = (v: number) => {
    const n = v / 1000000;
    return Number.isInteger(n) || n % 1 === 0 ? `${n.toFixed(0)}` : `${parseFloat(n.toFixed(1))}`;
  };
  if (deal === 'rent') {
    if (price >= 1000000) return `${fmtMln(price)} млн ₽/мес`;
    return `${(price / 1000).toFixed(0)} тыс ₽/мес`;
  }
  if (price >= 1000000) return `${fmtMln(price)} млн ₽`;
  return `${(price / 1000).toFixed(0)} тыс ₽`;
}

const ASSESS_STYLES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  green:   'bg-green-50 text-green-700 border-green-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-600 border-red-200',
  gray:    'bg-slate-50 text-slate-500 border-slate-200',
};

interface PredictHint {
  price_assessment: { label: string; color: string; delta_pct: number };
}

const predictCache = new Map<number, PredictHint | null>();
// Подписчики: id → список колбэков (может быть несколько карточек с одним id)
const predictListeners = new Map<number, Array<(h: PredictHint | null) => void>>();

// Батч-очередь: собираем id в течение BATCH_DELAY мс, затем один запрос
let batchQueue: number[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY = 80;

function flushBatch() {
  batchTimer = null;
  const ids = [...new Set(batchQueue)];
  batchQueue = [];
  if (ids.length === 0) return;

  fetch(`${PREDICT_URL}?ids=${ids.join(',')}`)
    .then(r => r.json())
    .then((data: Record<string, { price_assessment?: PredictHint['price_assessment'] }>) => {
      ids.forEach(id => {
        const d = data[String(id)];
        const val: PredictHint | null = d?.price_assessment ? { price_assessment: d.price_assessment } : null;
        predictCache.set(id, val);
        predictListeners.get(id)?.forEach(cb => cb(val));
        predictListeners.delete(id);
      });
    })
    .catch(() => {
      ids.forEach(id => {
        predictCache.set(id, null);
        predictListeners.get(id)?.forEach(cb => cb(null));
        predictListeners.delete(id);
      });
    });
}

function schedulePredictFetch(id: number, cb: (h: PredictHint | null) => void) {
  if (predictCache.has(id)) { cb(predictCache.get(id) ?? null); return; }
  const listeners = predictListeners.get(id) ?? [];
  listeners.push(cb);
  predictListeners.set(id, listeners);
  if (!batchQueue.includes(id)) batchQueue.push(id);
  if (!batchTimer) batchTimer = setTimeout(flushBatch, BATCH_DELAY);
}

function usePredictHint(listingId: number) {
  const [hint, setHint] = useState<PredictHint | null | undefined>(
    predictCache.has(listingId) ? predictCache.get(listingId) : undefined
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (predictCache.has(listingId)) { setHint(predictCache.get(listingId) ?? null); return; }
    if (fetched.current) return;
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      if (fetched.current) return;
      fetched.current = true;
      schedulePredictFetch(listingId, val => setHint(val));
    }, { rootMargin: '100px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [listingId]);

  return { hint, rootRef };
}

function getCoverImage(property: PropertyCardProps['property']): string | null {
  // В карточке всегда показываем ТОЛЬКО обложку. Доп. фото грузятся
  // на странице объекта. Это экономит трафик и ускоряет загрузку списков.
  if (property.image) return property.image;
  const raw = (property as { images?: string | string[] }).images;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  if (typeof raw === 'string' && raw) {
    const sep = raw.includes('|') ? '|' : ',';
    const first = raw.split(sep).map(s => s.trim()).filter(Boolean)[0];
    if (first) return first;
  }
  return null;
}

export default function PropertyCard({
  property, isFavorite, isCompare, onToggleFavorite, onToggleCompare, style, index = 99,
}: PropertyCardProps) {
  const href = `/object/${listingSlug(property.title, property.id)}`;
  const { hint, rootRef } = usePredictHint(property.id);
  const { settings } = useSettings();

  const cover = getCoverImage(property);
  const [mapOpen, setMapOpen] = useState(false);

  const ppm2 = property.pricePerM2
    ? property.pricePerM2
    : property.area > 0 ? Math.round(property.price / property.area) : null;

  const publicId = fmtListingId(property.id);
  const assessCls = hint?.price_assessment
    ? (ASSESS_STYLES[hint.price_assessment.color] ?? ASSESS_STYLES.gray) : null;

  const addressLine = [property.district, property.address].filter(Boolean).join(', ') || null;
  const mapQuery = [property.district, property.address].filter(Boolean).join(', ');
  const hasCoords = !!(property.lat && property.lng);

  const isAutoNew = useMemo(() => {
    const dateStr = property.createdAt;
    if (!dateStr) return false;
    const created = new Date(dateStr).getTime();
    return (Date.now() - created) < 5 * 24 * 60 * 60 * 1000;
  }, [property.createdAt]);
  const showNew = property.isNew || isAutoNew;

  // Предзагрузка страницы объекта и его данных при наведении/касании —
  // к моменту клика всё уже готово, карточка открывается мгновенно.
  const prefetched = useRef(false);
  const handlePrefetch = () => {
    if (prefetched.current) return;
    prefetched.current = true;
    prefetchPage('property');
    prefetchListingById(property.id);
  };

  return (
    <>
      <div
        ref={rootRef}
        onMouseEnter={handlePrefetch}
        onTouchStart={handlePrefetch}
        className="property-card group bg-white rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up flex flex-col"
        style={style}
      >
        {/* ── Обложка (только 1 фото) ── */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">

          {/* Только обложка — доп. фото загружаются на странице объекта */}
          {cover ? (
            <img
              src={cover}
              alt={property.title}
              width={400}
              height={300}
              sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 768px) calc(50vw - 24px), (max-width: 1024px) calc(33vw - 24px), 300px"
              loading={index < 4 ? 'eager' : 'lazy'}
              fetchpriority={index === 0 ? 'high' : index < 4 ? 'auto' : 'low'}
              decoding={index === 0 ? 'sync' : 'async'}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Icon name="Image" size={36} />
            </div>
          )}

          {/* Градиент снизу */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent pointer-events-none" />

          {/* Клик по фото открывает страницу объекта */}
          <Link to={href} className="absolute inset-0 z-[1]" aria-label={property.title} />

          {/* ── Бейджи сверху-слева — поверх ссылки ── */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1 z-[5] pointer-events-none">
            <span className={`text-[11px] font-bold font-display px-2.5 py-1 rounded-full shadow ${DEAL_COLORS[property.deal] ?? 'bg-white/90 text-brand-blue'}`}>
              {DEAL_LABELS[property.deal]}
            </span>
            {property.isUrgent && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-red-500 text-white shadow flex items-center gap-1">
                ⚡ Срочно
              </span>
            )}
            {property.isHot && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-orange-500 text-white shadow flex items-center gap-1">
                🔥 Горячее
              </span>
            )}
            {property.isExclusive && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-amber-400 text-white shadow flex items-center gap-1">
                ⭐ Эксклюзив
              </span>
            )}
            {showNew && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow">
                Новое
              </span>
            )}
          </div>



          {/* Избранное / сравнение — на тач-устройствах всегда видимы, на десктопе на hover */}
          <div className="absolute right-2 top-10 flex flex-col gap-1.5 z-[5] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={e => { e.preventDefault(); onToggleFavorite(property.id); }}
              aria-label="В избранное"
              className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-slate-400 hover:text-red-500'}`}>
              <Icon name="Heart" size={14} className={isFavorite ? 'fill-current' : ''} />
            </button>
            <button type="button" onClick={e => { e.preventDefault(); onToggleCompare(property.id); }}
              aria-label="К сравнению"
              className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isCompare ? 'bg-brand-orange text-white' : 'bg-white/90 text-slate-400 hover:text-brand-orange'}`}>
              <Icon name="GitCompare" size={14} />
            </button>
          </div>

          {/* Тип объекта — нижний левый угол */}
          <div className="absolute left-2.5 bottom-2.5 z-10">
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-black/55 text-white backdrop-blur-sm">
              {TYPE_LABELS[property.type] || property.type}
            </span>
          </div>
        </div>

        {/* ── Цена + ID ── */}
        <div className="px-3 pt-2.5 pb-2.5 bg-brand-blue/[0.04] border-b border-brand-blue/10">
          <div className="flex items-start justify-between gap-1 min-w-0">
            <div className="font-display font-900 text-base sm:text-[18px] text-brand-blue leading-none tracking-tight truncate">
              {property.price.toLocaleString('ru')} ₽{property.deal === 'rent' ? '/мес' : ''}
            </div>
            <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5 select-none whitespace-nowrap">
              #{publicId}
            </span>
          </div>
          {ppm2 && (
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium flex items-center gap-1">
              <Icon name="Scaling" size={10} className="text-muted-foreground/60" />
              {ppm2.toLocaleString('ru')} ₽/м²
            </div>
          )}
        </div>

        {/* ── Контент ── */}
        <div className="px-3 pt-2 pb-2.5 flex flex-col flex-1 gap-1.5">

          {/* Название */}
          <Link to={href}>
            <h3 className="font-display font-700 text-[13px] text-foreground leading-snug line-clamp-2 group-hover:text-brand-blue transition-colors">
              {property.title}
            </h3>
          </Link>

          {/* Ключевые параметры */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[12px] font-semibold text-foreground">
              <Icon name="Maximize" size={11} className="text-brand-blue/60" />
              {property.area} м²
            </div>
            {property.floor ? (
              <div className="flex items-center gap-1 text-[12px] font-semibold text-foreground">
                <Icon name="Layers" size={11} className="text-brand-blue/60" />
                {property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''} эт.
              </div>
            ) : property.payback ? (
              <div className="flex items-center gap-1 text-[12px] font-semibold text-emerald-700">
                <Icon name="TrendingUp" size={11} className="text-emerald-600" />
                {property.payback} мес
              </div>
            ) : null}
            {(() => {
              // Логика блока дохода:
              // - аренда → не показываем (цена и так за месяц)
              // - готовый бизнес (deal=business) + profit → "Доход: +X тыс/мес"
              // - продажа/ГАБ с реальным арендатором (tenantName или monthlyRent) → "Сдан в аренду: +X тыс/мес"
              // - просто profit без арендатора → "+X тыс/мес" (прогноз, синий)
              if (property.deal === 'rent') return null;
              const income = property.monthlyRent || property.profit || 0;
              if (!income) return null;
              const hasTenant = !!property.tenantName || !!property.monthlyRent;
              const isBusiness = property.deal === 'business';
              const label = isBusiness
                ? 'Доход'
                : hasTenant
                  ? 'Сдан'
                  : 'Прогноз';
              const isFact = hasTenant || isBusiness;
              const color = isFact ? 'text-emerald-700' : 'text-blue-700';
              const iconColor = isFact ? 'text-emerald-600' : 'text-blue-600';
              const icon = isFact ? 'CheckCircle2' : 'TrendingUp';
              return (
                <div
                  className={`flex items-center gap-1 text-[12px] font-semibold ${color}`}
                  title={hasTenant && property.tenantName ? `Арендатор: ${property.tenantName}` : ''}
                >
                  <Icon name={icon} size={11} className={iconColor} />
                  <span className="opacity-80">{label}:</span>
                  <span>+{(income / 1000).toFixed(0)} тыс/мес</span>
                </div>
              );
            })()}
          </div>

          {/* Адрес */}
          {addressLine && (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand-blue transition-colors text-left w-full group/addr"
            >
              <Icon name="MapPin" size={10} className="flex-shrink-0 text-brand-blue/50 group-hover/addr:text-brand-blue transition-colors" />
              <span className="truncate">{addressLine}</span>
            </button>
          )}

          {/* Оценка рынка (ниже рынка / выше рынка) скрыта в общем списке карточек */}
          {/*
          {assessCls && hint?.price_assessment && (
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${assessCls}`}>
              <Icon name="BarChart2" size={10} />
              {hint.price_assessment.label}
              {hint.price_assessment.delta_pct !== 0 && (
                <span className="opacity-75">{hint.price_assessment.delta_pct > 0 ? ' +' : ' '}{hint.price_assessment.delta_pct}%</span>
              )}
            </div>
          )}
          */}

          {/* Футер */}
          <div className="mt-auto flex items-center justify-end gap-2 pt-1.5 border-t border-border/50">
            <Link to={href}
              className="btn-orange text-white text-[11px] font-bold font-display px-3 py-1.5 rounded-lg inline-flex items-center gap-1 flex-shrink-0">
              Подробнее <Icon name="ArrowRight" size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Попап карты ── */}
      {mapOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setMapOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="font-display font-700 text-sm text-foreground line-clamp-1">{property.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Icon name="MapPin" size={11} />
                  {addressLine}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`https://yandex.ru/maps/?text=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-blue hover:underline flex items-center gap-1"
                >
                  Открыть в Яндекс.Картах <Icon name="ExternalLink" size={11} />
                </a>
                <button type="button" onClick={() => setMapOpen(false)}
                  className="w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Icon name="X" size={14} />
                </button>
              </div>
            </div>
            {hasCoords && settings.yandex_maps_api_key ? (
              <YandexMap
                points={[{ id: property.id, lat: property.lat, lng: property.lng, title: property.title, caption: addressLine || '' }]}
                zoom={15}
                height="300px"
              />
            ) : (
              <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Icon name="MapPin" size={32} />
                <div className="text-sm font-medium">{addressLine}</div>
                <a
                  href={`https://yandex.ru/maps/?text=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-blue hover:underline"
                >
                  Открыть в Яндекс.Картах →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}