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
  onSeeAll: () => void;
}

export default function HomeNewListings({
  newObjects, homeLimit, favorites, compareList,
  onToggleFavorite, onToggleCompare, onSeeAll,
}: HomeNewListingsProps) {
  return (
    <section className="py-6 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Icon name="Building2" size={16} className="text-brand-blue" />
            <h2 className="font-display font-700 text-base text-foreground">Аренда и продажа коммерческой недвижимости в Краснодаре</h2>
          </div>
          <button
            onClick={onSeeAll}
            aria-label="Смотреть все объекты каталога"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
          >
            Смотреть все объекты <Icon name="ArrowRight" size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div key={`sk-${i}`} className="rounded-2xl overflow-hidden border border-border bg-white flex flex-col">
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
      </div>
    </section>
  );
}