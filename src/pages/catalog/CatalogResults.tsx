import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import SchemaOrg from '@/components/SchemaOrg';
import Icon from '@/components/ui/icon';

interface CatalogResultsProps {
  h1: string;
  filtered: Property[];
  pageItems: Property[];
  favorites: number[];
  compareList: number[];
  visibleCount: number;
  hasMore: boolean;
  allLoaded: boolean;
  dealFilter: string;
  typeFilter: string;
  catalogBreadcrumbSchema: object;
  loadStep: number;
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onLoadMore: () => void;
}

export default function CatalogResults({
  h1, filtered, pageItems, favorites, compareList,
  visibleCount, hasMore, allLoaded, dealFilter, typeFilter,
  catalogBreadcrumbSchema, loadStep,
  onToggleFavorite, onToggleCompare, onLoadMore,
}: CatalogResultsProps) {
  return (
    <section className="container mx-auto px-4 py-8" aria-label="Каталог объектов">
      <SchemaOrg schema={catalogBreadcrumbSchema} id="catalog-breadcrumb" />
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: 'Главная', to: '/' },
          ...(typeFilter !== 'all' || dealFilter !== 'all'
            ? [{ label: 'Каталог', to: '/catalog' }]
            : []),
          { label: h1 },
        ]} />
      </div>
      <h1 className="font-display font-900 text-2xl md:text-3xl text-foreground mb-4">{h1}</h1>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          Найдено <span className="font-semibold text-foreground">{filtered.length}</span> объектов
          {hasMore && (
            <span> · показано <span className="font-semibold text-foreground">{visibleCount}</span></span>
          )}
          {!allLoaded && (
            <span className="inline-flex items-center gap-1 text-brand-blue/70 text-xs">
              <span className="w-3 h-3 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" />
              загружаем ещё…
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <div className="font-display font-700 text-xl text-foreground mb-2">Объекты не найдены</div>
          <div className="text-muted-foreground">Попробуйте изменить параметры поиска</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pageItems.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                isFavorite={favorites.includes(property.id)}
                isCompare={compareList.includes(property.id)}
                onToggleFavorite={onToggleFavorite}
                onToggleCompare={onToggleCompare}
                index={i}
                style={{ animationDelay: `${i * 0.03}s`, opacity: 0 }}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex flex-col items-center gap-2 mt-10">
              <button
                onClick={onLoadMore}
                className="btn-orange text-white px-8 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
              >
                <Icon name="ChevronDown" size={16} />
                Показать ещё {Math.min(loadStep, filtered.length - visibleCount)} объектов
              </button>
              <div className="text-xs text-muted-foreground">
                Показано {visibleCount} из {filtered.length}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}