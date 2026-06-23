import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/icon';
import DistrictOptions from '@/components/DistrictOptions';
import { District } from '@/lib/api';
import { CatSort, CategoryMetaItem } from './categoryMeta';

interface CategoryToolbarProps {
  meta: CategoryMetaItem;
  itemsCount: number;
  showFilters: boolean;
  setShowFilters: (fn: (v: boolean) => boolean) => void;
  hasActiveFilters: boolean;
  dealFilter: string;
  setDealFilter: (v: string) => void;
  districtFilter: string;
  setDistrictFilter: (v: string) => void;
  minArea: string;
  setMinArea: (v: string) => void;
  maxPrice: string;
  setMaxPrice: (v: string) => void;
  sortBy: CatSort;
  setSortBy: (v: CatSort) => void;
  districts: District[];
  resetFilters: () => void;
}

export default function CategoryToolbar({
  meta, itemsCount, showFilters, setShowFilters, hasActiveFilters,
  dealFilter, setDealFilter, districtFilter, setDistrictFilter,
  minArea, setMinArea, maxPrice, setMaxPrice, sortBy, setSortBy,
  districts, resetFilters,
}: CategoryToolbarProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-white border-b border-border">
      <div className="container mx-auto px-4 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-muted-foreground">
            <h3 className="inline font-semibold text-foreground">{meta.h3}</h3>{' '}—{' '}
            найдено <span className="font-semibold text-foreground">{itemsCount}</span> объектов
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-colors ${
                showFilters || hasActiveFilters
                  ? 'border-brand-blue bg-brand-blue text-white'
                  : 'border-border text-brand-blue hover:border-brand-blue'
              }`}
            >
              <Icon name="SlidersHorizontal" size={13} />
              Фильтры и сортировка
              {hasActiveFilters && (
                <span className="w-4 h-4 rounded-full bg-white text-brand-blue text-[10px] flex items-center justify-center font-bold">
                  {[dealFilter !== 'all', districtFilter !== 'all', !!minArea, !!maxPrice].filter(Boolean).length}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/catalog')}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Icon name="LayoutGrid" size={13} />
              Все категории
            </button>
          </div>
        </div>

        {/* Панель фильтров (вариант А — прямо на странице категории) */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Тип сделки */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип сделки</div>
                <select value={dealFilter} onChange={e => setDealFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                  <option value="all">Все</option>
                  <option value="sale">Продажа</option>
                  <option value="rent">Аренда</option>
                </select>
              </div>
              {/* Район */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Район</div>
                <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                  <option value="all">Все районы</option>
                  <DistrictOptions districts={districts} />
                </select>
              </div>
              {/* Площадь и цена */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">От м²</div>
                  <input type="number" value={minArea} onChange={e => setMinArea(e.target.value)} placeholder="50"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">До, млн ₽</div>
                  <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="100"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                </div>
              </div>
              {/* Сортировка */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Сортировка</div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as CatSort)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                  <option value="newest">Сначала свежие</option>
                  <option value="price_asc">Цена: по возрастанию</option>
                  <option value="price_desc">Цена: по убыванию</option>
                  <option value="area_asc">Площадь: по возрастанию</option>
                </select>
              </div>
            </div>
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="mt-3 text-xs text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80">
                <Icon name="X" size={12} /> Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
