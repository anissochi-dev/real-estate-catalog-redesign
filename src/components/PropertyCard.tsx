import { Link } from 'react-router-dom';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import { listingSlug } from '@/lib/slug';

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
  retail: 'Торговое помещение',
  warehouse: 'Склад',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производственное помещение',
  hotel: 'Гостиница',
  gab: 'ГАБ',
  land: 'Земельный участок',
  building: 'Отдельно стоящее здание',
  free_purpose: 'Помещение свободного назначения',
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

export default function PropertyCard({
  property,
  isFavorite,
  isCompare,
  onToggleFavorite,
  onToggleCompare,
  style,
}: PropertyCardProps) {
  const href = `/object/${listingSlug(property.title, property.id)}`;
  return (
    <div
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent pointer-events-none" />
        </Link>

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[70%]">
          <span className="text-[11px] font-semibold font-display px-2.5 py-1 rounded-full bg-white/95 text-brand-blue shadow-sm backdrop-blur-sm">
            {DEAL_LABELS[property.deal]}
          </span>
          {property.isHot && (
            <span className="text-[11px] font-semibold font-display px-2.5 py-1 rounded-full bg-brand-orange text-white shadow-sm">
              Горячее
            </span>
          )}
          {property.isNew && (
            <span className="text-[11px] font-semibold font-display px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow-sm">
              Новое
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-90 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onToggleFavorite(property.id)}
            aria-label="В избранное"
            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200
              ${isFavorite ? 'bg-red-500 text-white scale-105' : 'bg-white/90 text-muted-foreground hover:text-red-500 hover:scale-105'}`}
          >
            <Icon name="Heart" size={16} className={isFavorite ? 'fill-current' : ''} />
          </button>
          <button
            type="button"
            onClick={() => onToggleCompare(property.id)}
            aria-label="К сравнению"
            className={`w-9 h-9 rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200
              ${isCompare ? 'bg-brand-orange text-white scale-105' : 'bg-white/90 text-muted-foreground hover:text-brand-orange hover:scale-105'}`}
          >
            <Icon name="GitCompare" size={16} />
          </button>
        </div>

        {/* Type + price overlay */}
        <div className="absolute left-3 right-3 bottom-3 flex items-end justify-between gap-3 text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/45 backdrop-blur-sm">
            {TYPE_LABELS[property.type] || property.type}
          </span>
          <div className="text-right drop-shadow-md">
            <div className="font-display font-800 text-lg leading-none">
              {formatPrice(property.price, property.deal)}
            </div>
            {property.pricePerM2 ? (
              <div className="text-[10px] text-white/85 mt-0.5">
                {property.pricePerM2.toLocaleString('ru')} ₽/м²
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <Link to={href}>
          <h3 className="font-display font-700 text-[15px] text-foreground leading-snug mb-1.5 line-clamp-2 group-hover:text-brand-blue transition-colors min-h-[2.6em]">
            {property.title}
          </h3>
        </Link>
        <div className="flex items-center gap-1 text-muted-foreground text-xs mb-3">
          <Icon name="MapPin" size={12} className="flex-shrink-0" />
          <span className="truncate">
            {[property.district, property.address].filter(Boolean).join(', ') || '—'}
          </span>
        </div>

        {/* Stats chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-muted/60 px-2 py-1 rounded-md">
            <Icon name="Maximize" size={11} />
            {property.area} м²
          </span>
          {property.floor ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground/75 bg-muted/60 px-2 py-1 rounded-md">
              <Icon name="Layers" size={11} />
              {property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''} эт.
            </span>
          ) : null}
          {property.payback ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md font-medium">
              <Icon name="TrendingUp" size={11} />
              Окуп. {property.payback} мес
            </span>
          ) : null}
        </div>

        {/* Tags */}
        {property.tags && property.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {property.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="tag-blue text-[10px] px-2 py-0.5 rounded-full font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Action footer */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border/60">
          {property.profit ? (
            <div className="text-xs text-emerald-700 font-semibold">
              + {(property.profit / 1000).toFixed(0)} тыс ₽/мес
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">ID {property.publicCode || property.id}</div>
          )}
          <Link to={href}
            className="btn-orange text-white text-xs font-semibold font-display px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
            Подробнее
            <Icon name="ArrowRight" size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}