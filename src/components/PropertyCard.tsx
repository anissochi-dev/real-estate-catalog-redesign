import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PropertyCardProps {
  property: Property;
  isFavorite: boolean;
  isCompare: boolean;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  style?: React.CSSProperties;
}

const TYPE_LABELS: Record<string, string> = {
  office: 'Офис',
  retail: 'Торговое',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производство',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земля',
  building: 'Здание',
  free_purpose: 'Своб. назнач.',
  car_service: 'Автосервис',
};

const DEAL_LABELS: Record<string, string> = {
  sale: 'Продажа',
  rent: 'Аренда',
  business: 'Готовый бизнес',
};

export function formatPrice(price: number, deal: string): string {
  if (deal === 'rent') {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)} млн ₽/мес`;
    return `${(price / 1000).toFixed(0)} тыс ₽/мес`;
  }
  if (price >= 1000000) return `${(price / 1000000).toFixed(1)} млн ₽`;
  return `${(price / 1000).toFixed(0)} тыс ₽`;
}

const ASSESS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  green:   { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-200' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  red:     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-200' },
  gray:    { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-200' },
};

interface PredictHint {
  price_assessment: { label: string; color: string; delta_pct: number };
  price_per_m2_median: number | null;
}

const cache = new Map<number, PredictHint | null>();

function usePredictHint(listingId: number) {
  const [hint, setHint] = useState<PredictHint | null | undefined>(
    cache.has(listingId) ? cache.get(listingId) : undefined
  );
  const ref = useRef<HTMLDivElement | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (cache.has(listingId)) { setHint(cache.get(listingId) ?? null); return; }
    if (fetched.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      if (fetched.current) return;
      fetched.current = true;
      fetch(`${PREDICT_URL}?id=${listingId}`)
        .then(r => r.json())
        .then(d => {
          const val: PredictHint | null = d.price_assessment ? {
            price_assessment: d.price_assessment,
            price_per_m2_median: d.price_per_m2_median ?? null,
          } : null;
          cache.set(listingId, val);
          setHint(val);
        })
        .catch(() => { cache.set(listingId, null); setHint(null); });
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [listingId]);

  return { hint, ref };
}

export default function PropertyCard({
  property,
  isFavorite,
  isCompare,
  onToggleFavorite,
  onToggleCompare,
  style,
}: PropertyCardProps) {
  const href = `/object/${listingSlug(property.title, property.id)}`;
  const { hint, ref } = usePredictHint(property.id);

  const ppm2 = property.pricePerM2
    ? property.pricePerM2
    : property.area > 0 ? Math.round(property.price / property.area) : null;

  const assessStyle = hint?.price_assessment
    ? (ASSESS_STYLES[hint.price_assessment.color] ?? ASSESS_STYLES.gray)
    : null;

  const publicId = property.publicCode || property.id;

  return (
    <div
      ref={ref}
      className="property-card group bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up flex flex-col"
      style={style}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Link to={href} className="block w-full h-full">
          {property.image ? (
            <img
              src={property.image}
              alt={property.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Icon name="Image" size={36} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
        </Link>

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[70%]">
          <span className="text-[10px] font-semibold font-display px-2 py-0.5 rounded-full bg-white/95 text-brand-blue shadow-sm backdrop-blur-sm">
            {DEAL_LABELS[property.deal]}
          </span>
          {property.isHot && (
            <span className="text-[10px] font-semibold font-display px-2 py-0.5 rounded-full bg-brand-orange text-white shadow-sm">
              🔥 Горячее
            </span>
          )}
          {property.isNew && (
            <span className="text-[10px] font-semibold font-display px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm">
              Новое
            </span>
          )}
        </div>

        {/* ID badge — всегда виден */}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-blue text-white shadow-sm font-mono">
            #{publicId}
          </span>
        </div>

        {/* Actions */}
        <div className="absolute bottom-14 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onToggleFavorite(property.id)}
            aria-label="В избранное"
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200
              ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-muted-foreground hover:text-red-500'}`}
          >
            <Icon name="Heart" size={14} className={isFavorite ? 'fill-current' : ''} />
          </button>
          <button
            type="button"
            onClick={() => onToggleCompare(property.id)}
            aria-label="К сравнению"
            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200
              ${isCompare ? 'bg-brand-orange text-white' : 'bg-white/90 text-muted-foreground hover:text-brand-orange'}`}
          >
            <Icon name="GitCompare" size={14} />
          </button>
        </div>

        {/* Price overlay — тип + цена + м² */}
        <div className="absolute left-2 right-2 bottom-2 flex items-end justify-between gap-2 text-white">
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm leading-tight">
            {TYPE_LABELS[property.type] || property.type}
          </span>
          <div className="text-right drop-shadow-md">
            <div className="font-display font-800 text-base leading-none">
              {formatPrice(property.price, property.deal)}
            </div>
            {ppm2 && (
              <div className="text-[10px] text-white/85 mt-0.5">
                {ppm2.toLocaleString('ru')} ₽/м²
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <Link to={href}>
          <h3 className="font-display font-700 text-[13px] text-foreground leading-snug mb-1 line-clamp-2 group-hover:text-brand-blue transition-colors min-h-[2.4em]">
            {property.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1 text-muted-foreground text-[11px] mb-2">
          <Icon name="MapPin" size={11} className="flex-shrink-0" />
          <span className="truncate">
            {[property.district, property.address].filter(Boolean).join(', ') || '—'}
          </span>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <span className="inline-flex items-center gap-0.5 text-[10px] text-foreground/75 bg-muted/60 px-1.5 py-0.5 rounded-md">
            <Icon name="Maximize" size={10} />
            {property.area} м²
          </span>
          {property.floor ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-foreground/75 bg-muted/60 px-1.5 py-0.5 rounded-md">
              <Icon name="Layers" size={10} />
              {property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''} эт.
            </span>
          ) : null}
          {property.payback ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md font-medium">
              <Icon name="TrendingUp" size={10} />
              {property.payback} мес
            </span>
          ) : null}
        </div>

        {/* Оценка рынка */}
        {hint?.price_assessment && assessStyle && (
          <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit mb-2 ${assessStyle.bg} ${assessStyle.text} ${assessStyle.border}`}>
            <Icon name="TrendingUp" size={10} />
            {hint.price_assessment.label}
            {hint.price_assessment.delta_pct !== 0 && (
              <span className="opacity-80">
                {hint.price_assessment.delta_pct > 0 ? ' +' : ' '}{hint.price_assessment.delta_pct}%
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          <div className="flex flex-col gap-0.5">
            {property.profit ? (
              <div className="text-[10px] text-emerald-700 font-semibold">
                +{(property.profit / 1000).toFixed(0)} тыс ₽/мес
              </div>
            ) : null}
          </div>
          <Link to={href}
            className="btn-orange text-white text-[11px] font-semibold font-display px-3 py-1.5 rounded-lg inline-flex items-center gap-1 flex-shrink-0">
            Подробнее
            <Icon name="ArrowRight" size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}
