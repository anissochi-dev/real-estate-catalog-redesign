import Icon from '@/components/ui/icon';
import { District } from '@/lib/api';

type SortOption = 'price_asc' | 'price_desc' | 'area_asc' | 'newest';

const DEAL_TYPES = [
  { value: 'all', label: 'Все' },
  { value: 'sale', label: 'Продажа' },
  { value: 'rent', label: 'Аренда' },
];

const PROPERTY_TYPES = [
  { value: 'all', label: 'Все типы' },
  { value: 'office', label: '🏢 Офисы' },
  { value: 'retail', label: '🛒 Магазин, торговое помещение' },
  { value: 'warehouse', label: '🏭 Склады' },
  { value: 'restaurant', label: '🍽️ Общепит, кафе, ресторан' },
  { value: 'hotel', label: '🛏️ Гостиницы' },
  { value: 'business', label: '💼 Готовый бизнес' },
  { value: 'gab', label: '📈 Готовый арендный бизнес (ГАБ)' },
  { value: 'production', label: '⚙️ Производственные помещения' },
  { value: 'land', label: '🌳 Земельные участки' },
  { value: 'building', label: '🏛️ Отдельно стоящие здания' },
  { value: 'free_purpose', label: '🔄 Свободное назначение' },
  { value: 'car_service', label: '🔧 Автосервисы' },
];

interface CatalogFiltersProps {
  dealFilter: string;
  typeFilter: string;
  districtFilter: string;
  minArea: string;
  maxPrice: string;
  sortBy: SortOption;
  showFilters: boolean;
  showMap: boolean;
  districts: District[];
  onDealChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onDistrictChange: (v: string) => void;
  onMinAreaChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  onSortChange: (v: SortOption) => void;
  onToggleFilters: () => void;
  onToggleMap: () => void;
  onResetFilters: () => void;
  onSubscribe?: () => void;
}

export default function CatalogFilters({
  dealFilter, typeFilter, districtFilter, minArea, maxPrice, sortBy,
  showFilters, showMap, districts,
  onDealChange, onTypeChange, onDistrictChange, onMinAreaChange, onMaxPriceChange,
  onSortChange, onToggleFilters, onToggleMap, onResetFilters, onSubscribe,
}: CatalogFiltersProps) {
  const hasActiveFilters = dealFilter !== 'all' || typeFilter !== 'all' || !!minArea || !!maxPrice || districtFilter !== 'all';
  const activeCount = [dealFilter !== 'all', typeFilter !== 'all', !!minArea, !!maxPrice, districtFilter !== 'all'].filter(Boolean).length;

  return (
    <div className="bg-white border-b border-border sticky top-16 z-30">
      <div className="container mx-auto px-4">

        {/* Табы тип сделки */}
        <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
          {DEAL_TYPES.map(dt => (
            <button
              key={dt.value}
              onClick={() => onDealChange(dt.value)}
              className={`flex-shrink-0 px-5 py-3.5 text-sm font-semibold font-display border-b-2 transition-all duration-200
                ${dealFilter === dt.value
                  ? 'border-brand-orange text-brand-orange'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
            >
              {dt.label}
            </button>
          ))}
          <div className="flex-1" />
          {/* Кнопка уведомлений MAX */}
          {onSubscribe && (
            <button
              onClick={onSubscribe}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 my-1.5 rounded-lg text-xs font-semibold transition-all border border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white mr-1.5"
            >
              <Icon name="Bell" size={14} />
              Уведомления в MAX
            </button>
          )}
          {/* Кнопка карты */}
          <button
            onClick={onToggleMap}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 my-1.5 rounded-lg text-xs font-semibold transition-all border mr-1.5
              ${showMap
                ? 'border-brand-orange bg-brand-orange text-white'
                : 'border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white'
              }`}
          >
            <Icon name="Map" size={14} />
            Карта
          </button>
          {/* Кнопка фильтров справа */}
          <button
            onClick={onToggleFilters}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 my-1.5 rounded-lg text-xs font-semibold transition-all border
              ${showFilters || hasActiveFilters
                ? 'border-brand-orange bg-brand-orange text-white'
                : 'border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white'
              }`}
          >
            <Icon name="SlidersHorizontal" size={14} />
            Фильтры
            {hasActiveFilters && (
              <span className="w-4 h-4 rounded-full bg-white text-brand-orange text-[10px] flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Раскрытые фильтры — скрываем когда карта открыта (там своя боковая панель) */}
        {showFilters && !showMap && (
          <div className="pb-4 pt-1 border-t border-border animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3">

              {/* Тип объекта */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип объекта</div>
                <select
                  value={typeFilter}
                  onChange={e => onTypeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors"
                >
                  {PROPERTY_TYPES.map(pt => (
                    <option key={pt.value} value={pt.value}>{pt.label}</option>
                  ))}
                </select>
              </div>

              {/* Район */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Район</div>
                <select
                  value={districtFilter}
                  onChange={e => onDistrictChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors"
                >
                  <option value="all">Все районы</option>
                  {districts.map(d => (
                    <option key={d.id} value={d.name}>{d.name}{d.listings_count ? ` (${d.listings_count})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Площадь и цена */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">От м²</div>
                  <input type="number" value={minArea} onChange={e => onMinAreaChange(e.target.value)}
                    placeholder="50"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">До цены (млн)</div>
                  <input type="number" value={maxPrice} onChange={e => onMaxPriceChange(e.target.value)}
                    placeholder="100"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                </div>
              </div>

              {/* Сортировка */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Сортировка</div>
                <select value={sortBy} onChange={e => onSortChange(e.target.value as SortOption)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                  <option value="newest">Сначала свежие</option>
                  <option value="price_asc">Цена: по возрастанию</option>
                  <option value="price_desc">Цена: по убыванию</option>
                  <option value="area_asc">Площадь: по возрастанию</option>
                </select>
              </div>
            </div>

            {/* Сброс */}
            {hasActiveFilters && (
              <button
                onClick={onResetFilters}
                className="mt-3 text-xs text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80"
              >
                <Icon name="X" size={12} /> Сбросить все фильтры
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}