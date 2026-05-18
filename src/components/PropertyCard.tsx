import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';
import YandexMap from '@/components/YandexMap';
import { useSettings } from '@/contexts/SettingsContext';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PropertyCardProps {
  property: Property & { images?: string | string[] };
  isFavorite: boolean;
  isCompare: boolean;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  style?: React.CSSProperties;
}

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад',
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
  if (deal === 'rent') {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)} млн ₽/мес`;
    return `${(price / 1000).toFixed(0)} тыс ₽/мес`;
  }
  if (price >= 1000000) return `${(price / 1000000).toFixed(1)} млн ₽`;
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
      fetch(`${PREDICT_URL}?id=${listingId}`)
        .then(r => r.json())
        .then(d => {
          const val: PredictHint | null = d.price_assessment
            ? { price_assessment: d.price_assessment } : null;
          predictCache.set(listingId, val);
          setHint(val);
        })
        .catch(() => { predictCache.set(listingId, null); setHint(null); });
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [listingId]);

  return { hint, rootRef };
}

function parseImages(property: PropertyCardProps['property']): string[] {
  const raw = (property as { images?: string | string[] }).images;
  if (Array.isArray(raw) && raw.length > 0) return raw.slice(0, 5);
  if (typeof raw === 'string' && raw) {
    const sep = raw.includes('|') ? '|' : ',';
    const arr = raw.split(sep).map(s => s.trim()).filter(Boolean).slice(0, 5);
    if (arr.length > 0) return arr;
  }
  return property.image ? [property.image] : [];
}

export default function PropertyCard({
  property, isFavorite, isCompare, onToggleFavorite, onToggleCompare, style,
}: PropertyCardProps) {
  const href = `/object/${listingSlug(property.title, property.id)}`;
  const { hint, rootRef } = usePredictHint(property.id);
  const { settings } = useSettings();

  const imgs = parseImages(property);
  const [activeImg, setActiveImg] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);

  const ppm2 = property.pricePerM2
    ? property.pricePerM2
    : property.area > 0 ? Math.round(property.price / property.area) : null;

  const publicId = property.publicCode || property.id;
  const assessCls = hint?.price_assessment
    ? (ASSESS_STYLES[hint.price_assessment.color] ?? ASSESS_STYLES.gray) : null;

  const addressLine = [property.district, property.address].filter(Boolean).join(', ') || null;
  const mapQuery = [property.district, property.address].filter(Boolean).join(', ');
  const hasCoords = !!(property.lat && property.lng);

  return (
    <>
      <div
        ref={rootRef}
        className="property-card group bg-white rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up flex flex-col"
        style={style}
      >
        {/* ── Фотослайдер ── */}
        <div className="relative aspect-[4/3] overflow-hidden bg-muted select-none">

          {/* Картинки */}
          {imgs.length > 0 ? (
            imgs.map((src, i) => (
              <img
                key={src + i}
                src={src}
                alt={property.title}
                loading="lazy"
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${i === activeImg ? 'opacity-100' : 'opacity-0'}`}
              />
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Icon name="Image" size={36} />
            </div>
          )}

          {/* Градиент снизу */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent pointer-events-none" />

          {/* Кликабельная область → переход на объект */}
          <Link to={href} className="absolute inset-0" aria-label={property.title} />

          {/* Стрелки слайдера */}
          {imgs.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setActiveImg(i => (i - 1 + imgs.length) % imgs.length); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              >
                <Icon name="ChevronLeft" size={14} />
              </button>
              <button
                type="button"
                onClick={e => { e.preventDefault(); setActiveImg(i => (i + 1) % imgs.length); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              >
                <Icon name="ChevronRight" size={14} />
              </button>
              {/* Точки */}
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {imgs.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={e => { e.preventDefault(); setActiveImg(i); }}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeImg ? 'bg-white scale-125' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Badges сверху-слева */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1 z-10">
            <span className={`text-[10px] font-bold font-display px-2 py-0.5 rounded-full shadow-sm ${DEAL_COLORS[property.deal] ?? 'bg-white/90 text-brand-blue'}`}>
              {DEAL_LABELS[property.deal]}
            </span>
            {property.isHot && (
              <span className="text-[10px] font-bold font-display px-2 py-0.5 rounded-full bg-brand-orange text-white shadow-sm">🔥 Горячее</span>
            )}
            {property.isNew && (
              <span className="text-[10px] font-bold font-display px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">Новое</span>
            )}
          </div>

          {/* ID — сверху-справа */}
          <div className="absolute top-2.5 right-2.5 z-10">
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-black/60 text-white/90 backdrop-blur-sm tracking-wide">
              #{publicId}
            </span>
          </div>

          {/* Избранное / сравнение */}
          <div className="absolute right-2.5 bottom-10 flex flex-col gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" onClick={e => { e.preventDefault(); onToggleFavorite(property.id); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-slate-400 hover:text-red-500'}`}>
              <Icon name="Heart" size={14} className={isFavorite ? 'fill-current' : ''} />
            </button>
            <button type="button" onClick={e => { e.preventDefault(); onToggleCompare(property.id); }}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all ${isCompare ? 'bg-brand-orange text-white' : 'bg-white/90 text-slate-400 hover:text-brand-orange'}`}>
              <Icon name="GitCompare" size={14} />
            </button>
          </div>

          {/* Тип + цена внизу фото */}
          <div className="absolute left-2.5 right-2.5 bottom-2.5 flex items-end justify-between gap-2 text-white z-10">
            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm">
              {TYPE_LABELS[property.type] || property.type}
            </span>
            <div className="text-right drop-shadow-md">
              <div className="font-display font-800 text-[15px] leading-none">
                {formatPrice(property.price, property.deal)}
              </div>
              {ppm2 && (
                <div className="text-[10px] text-white/80 mt-0.5">
                  {ppm2.toLocaleString('ru')} ₽/м²
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Контент ── */}
        <div className="p-3 flex flex-col flex-1 gap-1.5">

          {/* Название */}
          <Link to={href}>
            <h3 className="font-display font-700 text-[13px] text-foreground leading-snug line-clamp-2 group-hover:text-brand-blue transition-colors min-h-[2.4em]">
              {property.title}
            </h3>
          </Link>

          {/* Адрес — кликабельный, открывает карту в попапе */}
          {addressLine && (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-brand-blue transition-colors text-left w-full group/addr"
              title="Показать на карте"
            >
              <Icon name="MapPin" size={11} className="flex-shrink-0 text-brand-blue/60 group-hover/addr:text-brand-blue transition-colors" />
              <span className="truncate underline decoration-dotted underline-offset-2">{addressLine}</span>
              <Icon name="Map" size={10} className="flex-shrink-0 opacity-0 group-hover/addr:opacity-60 transition-opacity ml-auto" />
            </button>
          )}

          {/* Ключевые параметры */}
          <div className="flex flex-wrap gap-1 mt-0.5">
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-foreground/70 bg-slate-100 px-1.5 py-0.5 rounded-md">
              <Icon name="Maximize" size={10} />{property.area} м²
            </span>
            {property.floor ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-foreground/70 bg-slate-100 px-1.5 py-0.5 rounded-md">
                <Icon name="Layers" size={10} />{property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''} эт.
              </span>
            ) : null}
            {property.payback ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                <Icon name="TrendingUp" size={10} />окуп. {property.payback} мес
              </span>
            ) : null}
          </div>

          {/* Оценка рынка */}
          {assessCls && hint?.price_assessment && (
            <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${assessCls}`}>
              <Icon name="BarChart2" size={10} />
              {hint.price_assessment.label}
              {hint.price_assessment.delta_pct !== 0 && (
                <span className="opacity-75">{hint.price_assessment.delta_pct > 0 ? ' +' : ' '}{hint.price_assessment.delta_pct}%</span>
              )}
            </div>
          )}

          {/* Футер */}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border/50">
            {property.profit ? (
              <span className="text-[10px] text-emerald-700 font-semibold">
                +{(property.profit / 1000).toFixed(0)} тыс ₽/мес
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/60">
                {imgs.length > 1 ? `${imgs.length} фото` : ''}
              </span>
            )}
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
