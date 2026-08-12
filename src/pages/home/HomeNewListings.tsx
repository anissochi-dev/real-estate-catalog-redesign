import { Link } from 'react-router-dom';
import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';

interface HomeNewListingsProps {
  newObjects: Property[];
  homeLimit: number;
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onSeeAll?: () => void;
}

export default function HomeNewListings({
  newObjects, homeLimit, favorites, compareList,
  onToggleFavorite, onToggleCompare,
}: HomeNewListingsProps) {
  return (
    <section className="py-12 md:py-16 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 md:mb-8">
          <div className="flex items-center gap-2.5">
            <Icon name="Building2" size={22} className="text-brand-blue" />
            <h2 className="font-display font-800 text-2xl md:text-3xl text-foreground">Аренда и продажа коммерческой недвижимости в Краснодаре</h2>
          </div>
          <Link
            to="/catalog"
            className="hidden sm:inline-flex items-center justify-start gap-1.5 text-brand-blue font-semibold text-sm hover:gap-3 transition-all duration-200 shrink-0"
          >
            Смотреть все объекты <Icon name="ArrowRight" size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {newObjects.map((property, i) => (
            <PropertyCard
              key={property.id}
              property={property}
              isFavorite={favorites.includes(property.id)}
              isCompare={compareList.includes(property.id)}
              onToggleFavorite={onToggleFavorite}
              onToggleCompare={onToggleCompare}
              index={i}
            />
          ))}
          {newObjects.length < homeLimit && Array.from({ length: homeLimit - newObjects.length }).map((_, i) => (
            <div key={`sk-${i}`} className="rounded-2xl overflow-hidden border border-border bg-white flex flex-col animate-pulse">
              <div className="aspect-[4/3] bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-3 bg-muted rounded-full w-1/4" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-6 bg-muted rounded w-1/3 mt-auto" />
              </div>
            </div>
          ))}
        </div>

        <Link
          to="/catalog"
          className="sm:hidden mt-4 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-brand-blue/30 bg-brand-blue/5 text-brand-blue font-semibold text-sm transition-all duration-200"
        >
          Смотреть все объекты <Icon name="ArrowRight" size={14} />
        </Link>
      </div>
    </section>
  );
}