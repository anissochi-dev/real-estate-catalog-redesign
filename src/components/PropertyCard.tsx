import { Link, useNavigate } from 'react-router-dom';
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
  variant?: 'default' | 'home';
}

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Магазин/торговое', warehouse: 'Склад',
  restaurant: 'Общепит', business: 'Готовый бизнес', production: 'Производство',
  hotel: 'Гостиница', gab: 'ГАБ', land: 'Земля', building: 'Здание',
  free_purpose: 'Своб. назнач.', car_service: 'Автосервис',
};

const TYPE_ICONS: Record<string, string> = {
  office: 'BriefcaseBusiness', retail: 'ShoppingBag', warehouse: 'Warehouse',
  restaurant: 'UtensilsCrossed', business: 'TrendingUp', production: 'Factory',
  hotel: 'Hotel', gab: 'KeyRound', land: 'Sprout', building: 'Building2',
  free_purpose: 'LayoutDashboard', car_service: 'Car',
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
const predictListeners = new Map<number, Array<(h: PredictHint | null) => void>>();

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
  property, isFavorite, isCompare, onToggleFavorite, onToggleCompare, style, index = 99, variant = 'default',
}: PropertyCardProps) {
  const isHome = variant === 'home';
  const href = `/object/${listingSlug(property.title, property.id)}`;
  const navigate = useNavigate();
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
        className={`property-card group bg-white rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up flex flex-col ${isHome ? 'sm:grid sm:grid-cols-[300px_1fr]' : ''}`}
        style={style}
      >
        {/* ── Левая колонка: фото ── */}
        <div className="relative overflow-hidden bg-muted aspect-[4/3]">
          {cover ? (
            <img
              src={cover}
              srcSet={property.image_thumb ? `${property.image_thumb} 800w, ${cover} 1920w` : undefined}
              alt={property.title}
              width={400}
              height={300}
              sizes="(max-width: 640px) calc(100vw - 32px), 240px"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

          {/* Клик по фото */}
          <Link to={href} className="absolute inset-0 z-[1]" aria-label={property.title} />

          {/* Бейджи сверху-слева */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1 z-[5] pointer-events-none">
            <span className={`text-[11px] font-bold font-display px-2.5 py-1 rounded-full shadow ${DEAL_COLORS[property.deal] ?? 'bg-white/90 text-brand-blue'}`}>
              {DEAL_LABELS[property.deal]}
            </span>
            {property.isUrgent && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-red-500 text-white shadow">⚡ Срочно</span>
            )}
            {property.isHot && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-orange-500 text-white shadow">🔥 Горячее</span>
            )}
            {property.isExclusive && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-amber-400 text-white shadow">⭐ Эксклюзив</span>
            )}
            {showNew && (
              <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow">Новое</span>
            )}
          </div>

          {/* Избранное / сравнение */}
          <div className="absolute right-2 top-2 flex flex-col gap-1.5 z-[5] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={e => { e.preventDefault(); onToggleFavorite(property.id); }}
              aria-label="В избранное"
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-slate-400 hover:text-red-500'}`}>
              <Icon name="Heart" size={13} className={isFavorite ? 'fill-current' : ''} />
            </button>
            <button type="button" onClick={e => { e.preventDefault(); onToggleCompare(property.id); }}
              aria-label="К сравнению"
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isCompare ? 'bg-brand-orange text-white' : 'bg-white/90 text-slate-400 hover:text-brand-orange'}`}>
              <Icon name="GitCompare" size={13} />
            </button>
          </div>

          {/* Категория — нижний левый угол фото */}
          <div className="absolute left-2.5 bottom-2.5 z-[5] pointer-events-none">
            <span className="text-[11px] font-bold font-display px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm uppercase tracking-wide">
              {TYPE_LABELS[property.type] || property.type}
            </span>
          </div>

          {/* ID — нижний правый угол фото */}
          <div className="absolute right-2.5 bottom-2.5 z-[5] pointer-events-none">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/50 text-white/80 backdrop-blur-sm">
              #{publicId}
            </span>
          </div>
        </div>

        {/* ── Правая колонка: контент ── */}
        <div className="flex flex-col justify-between p-4 gap-3 min-w-0">

          {/* Верхний блок */}
          <div className="space-y-1.5 min-w-0">

            {/* Название */}
            <Link to={href}>
              <h3 className={`font-display font-800 text-foreground leading-snug line-clamp-2 group-hover:text-brand-blue transition-colors ${isHome ? 'text-[18px] sm:text-[20px]' : 'font-700 text-[14px] sm:text-[15px]'}`}>
                {property.title}
              </h3>
            </Link>

            {/* Адрес */}
            {addressLine ? (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="flex items-start gap-1 text-[12px] text-muted-foreground hover:text-brand-blue transition-colors text-left w-full min-w-0 group/addr"
              >
                <Icon name="MapPin" size={11} className="flex-shrink-0 text-brand-blue/40 group-hover/addr:text-brand-blue mt-0.5 transition-colors" />
                <span className="truncate min-w-0">{addressLine}</span>
              </button>
            ) : property.district ? (
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); navigate(`/catalog?search=${encodeURIComponent(property.district || '')}`); }}
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-brand-blue transition-colors"
              >
                <Icon name="MapPin" size={11} className="text-brand-blue/40" />
                {property.district}
              </button>
            ) : null}
          </div>

          {/* Характеристики */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 bg-muted/50 rounded-xl px-3 py-2 items-center">
            {/* Категория с иконкой */}
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-blue">
              <Icon name={TYPE_ICONS[property.type] || 'Building2'} size={12} className="text-brand-blue" />
              {TYPE_LABELS[property.type] || property.type}
            </div>
            <span className="text-border text-[10px]">|</span>
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
              <Icon name="Maximize" size={12} className="text-brand-blue/50" />
              {property.area} м²
            </div>
            {property.floor ? (
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <Icon name="Layers" size={12} className="text-brand-blue/50" />
                {property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''} эт.
              </div>
            ) : property.payback ? (
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                <Icon name="TrendingUp" size={12} className="text-emerald-500" />
                Окуп. {property.payback} мес
              </div>
            ) : null}
            {(() => {
              if (property.deal === 'rent') return null;
              const income = property.monthlyRent || property.profit || 0;
              if (!income) return null;
              const hasTenant = !!property.tenantName || !!property.monthlyRent;
              const isBusiness = property.deal === 'business';
              const label = isBusiness ? 'Доход' : hasTenant ? 'Сдан' : 'Прогноз';
              const isFact = hasTenant || isBusiness;
              return (
                <div
                  className={`flex items-center gap-1.5 text-[12px] font-semibold ${isFact ? 'text-emerald-700' : 'text-blue-700'}`}
                  title={hasTenant && property.tenantName ? `Арендатор: ${property.tenantName}` : ''}
                >
                  <Icon name={isFact ? 'CheckCircle2' : 'TrendingUp'} size={12} className={isFact ? 'text-emerald-500' : 'text-blue-500'} />
                  {label}: +{(income / 1000).toFixed(0)} тыс/мес
                </div>
              );
            })()}
          </div>

          {/* Цена + кнопка */}
          <div className="flex items-end justify-between gap-3 flex-wrap border-t border-border/60 pt-3">
            <div>
              <div className={`font-display font-900 leading-none tracking-tight text-foreground ${isHome ? 'text-[24px] sm:text-[28px]' : 'text-[20px] sm:text-[22px]'}`}>
                {property.price.toLocaleString('ru')} ₽{property.deal === 'rent' ? '/мес' : ''}
              </div>
              {ppm2 && (
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Icon name="Scaling" size={10} className="text-muted-foreground/50" />
                  {ppm2.toLocaleString('ru')} ₽/м²
                </div>
              )}
            </div>
            {isHome && property.ownerPhone ? (
              <a
                href={`tel:${property.ownerPhone}`}
                onClick={e => e.stopPropagation()}
                className="bg-brand-blue text-white text-[12px] font-bold font-display px-4 py-2 rounded-xl inline-flex items-center gap-1.5 flex-shrink-0 shadow-sm hover:bg-brand-blue/90 transition-colors"
              >
                <Icon name="Phone" size={13} /> Позвонить
              </a>
            ) : (
              <Link
                to={href}
                className="btn-orange text-white text-[12px] font-bold font-display px-4 py-2 rounded-xl inline-flex items-center gap-1.5 flex-shrink-0 shadow-sm"
              >
                Подробнее <Icon name="ArrowRight" size={12} />
              </Link>
            )}
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
              <div className="h-[200px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Icon name="MapPin" size={32} className="text-brand-blue/40" />
                <div className="text-sm text-center px-4">
                  <a
                    href={`https://yandex.ru/maps/?text=${encodeURIComponent(mapQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-blue hover:underline font-medium"
                  >
                    Открыть в Яндекс.Картах →
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}