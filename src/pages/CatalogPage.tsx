import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';

const PAGE_SIZE = 20;

interface CatalogPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

type SortOption = 'price_asc' | 'price_desc' | 'area_asc' | 'newest';

const DEAL_TYPES = [
  { value: 'all', label: 'Все' },
  { value: 'sale', label: 'Продажа' },
  { value: 'rent', label: 'Аренда' },
  { value: 'business', label: 'Готовый бизнес' },
];

const PROPERTY_TYPES = [
  { value: 'all', label: 'Все типы' },
  { value: 'office', label: '🏢 Офисы' },
  { value: 'retail', label: '🛒 Торговые помещения' },
  { value: 'warehouse', label: '🏭 Склады' },
  { value: 'restaurant', label: '🍽️ Общепит' },
  { value: 'hotel', label: '🛏️ Гостиницы' },
  { value: 'business', label: '💼 Готовый бизнес' },
  { value: 'gab', label: '📈 ГАБ' },
  { value: 'production', label: '⚙️ Производственные помещения' },
  { value: 'land', label: '🌳 Земельные участки' },
  { value: 'building', label: '🏛️ Отдельно стоящие здания' },
  { value: 'free_purpose', label: '🔄 Свободное назначение' },
  { value: 'car_service', label: '🔧 Автосервисы' },
];

export default function CatalogPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: CatalogPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dealFilter, setDealFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [minArea, setMinArea] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);


  // Читаем фильтры из URL при первом рендере
  useEffect(() => {
    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const q = searchParams.get('search');
    if (deal) setDealFilter(deal);
    if (type) setTypeFilter(type);
    if (q) setSearch(q);
  }, [searchParams]);

  // Синхронизируем выбранный deal в URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (dealFilter !== 'all') next.set('deal', dealFilter); else next.delete('deal');
    if (typeFilter !== 'all') next.set('type', typeFilter); else next.delete('type');
    setSearchParams(next, { replace: true });
    setPage(1);
  }, [dealFilter, typeFilter]);

  const filtered = useMemo(() => {
    let result = [...properties];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.district.toLowerCase().includes(q)
      );
    }

    if (dealFilter !== 'all') result = result.filter(p => String(p.deal) === dealFilter);
    if (typeFilter !== 'all') result = result.filter(p => String(p.type) === typeFilter);
    if (minArea) result = result.filter(p => p.area >= Number(minArea));
    if (maxPrice) result = result.filter(p => p.price <= Number(maxPrice) * 1000000);

    switch (sortBy) {
      case 'price_asc': result.sort((a, b) => a.price - b.price); break;
      case 'price_desc': result.sort((a, b) => b.price - a.price); break;
      case 'area_asc': result.sort((a, b) => a.area - b.area); break;
      case 'newest': result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)); break;
    }

    return result;
  }, [properties, search, dealFilter, typeFilter, sortBy, minArea, maxPrice]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // Сброс страницы при изменении поиска/сортировки
  useEffect(() => { setPage(1); }, [search, sortBy, minArea, maxPrice]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-16 z-30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 flex items-center gap-2 bg-muted rounded-xl px-4 py-2.5">
              <Icon name="Search" size={18} className="text-muted-foreground flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по названию, адресу, району..."
                className="bg-transparent outline-none text-sm w-full text-foreground placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                  <Icon name="X" size={16} />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-all duration-200
                ${showFilters ? 'border-brand-blue bg-brand-blue text-white' : 'border-border text-foreground hover:border-brand-blue'}`}
            >
              <Icon name="SlidersHorizontal" size={16} />
              Фильтры
            </button>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2.5 rounded-xl border-2 border-border bg-white text-sm font-medium text-foreground outline-none cursor-pointer hover:border-brand-blue transition-colors"
            >
              <option value="newest">Сначала новые</option>
              <option value="price_asc">Цена: по возрастанию</option>
              <option value="price_desc">Цена: по убыванию</option>
              <option value="area_asc">Площадь: по возрастанию</option>
            </select>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Deal type */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип сделки</div>
                  <div className="flex flex-wrap gap-2">
                    {DEAL_TYPES.map(dt => (
                      <button
                        key={dt.value}
                        onClick={() => setDealFilter(dt.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150
                          ${dealFilter === dt.value ? 'bg-brand-blue text-white' : 'bg-muted text-foreground hover:bg-brand-blue/10'}`}
                      >
                        {dt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Property type */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип объекта</div>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none"
                  >
                    {PROPERTY_TYPES.map(pt => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Area & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">От м²</div>
                    <input
                      type="number"
                      value={minArea}
                      onChange={e => setMinArea(e.target.value)}
                      placeholder="50"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">До цены (млн)</div>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={e => setMaxPrice(e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deal type tabs */}
      <div className="bg-white border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-none">
            {DEAL_TYPES.map(dt => (
              <button
                key={dt.value}
                onClick={() => setDealFilter(dt.value)}
                className={`flex-shrink-0 px-5 py-3.5 text-sm font-semibold font-display border-b-2 transition-all duration-200
                  ${dealFilter === dt.value
                    ? 'border-brand-orange text-brand-orange'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог' },
          ]} />
        </div>
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-muted-foreground">
            Найдено <span className="font-semibold text-foreground">{filtered.length}</span> объектов
            {filtered.length > PAGE_SIZE && (
              <span> · показаны {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</span>
            )}
          </div>
          {(search || dealFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); }}
              className="text-sm text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <Icon name="X" size={14} />
              Сбросить фильтры
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <div className="font-display font-700 text-xl text-foreground mb-2">Объекты не найдены</div>
            <div className="text-muted-foreground">Попробуйте изменить параметры поиска</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {pageItems.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  isFavorite={favorites.includes(property.id)}
                  isCompare={compareList.includes(property.id)}
                  onToggleFavorite={onToggleFavorite}
                  onToggleCompare={onToggleCompare}
                  style={{ animationDelay: `${i * 0.03}s`, opacity: 0 }}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-10">
                <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-muted">
                  <Icon name="ChevronLeft" size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                  .map((n, idx, arr) => (
                    <span key={n}>
                      {idx > 0 && arr[idx - 1] !== n - 1 && <span className="px-2 text-muted-foreground">…</span>}
                      <button onClick={() => setPage(n)}
                        className={`px-3.5 py-2 rounded-lg text-sm font-semibold ${n === page ? 'bg-brand-blue text-white' : 'border border-border hover:bg-muted'}`}>
                        {n}
                      </button>
                    </span>
                  ))}
                <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-2 rounded-lg border border-border text-sm font-semibold disabled:opacity-40 hover:bg-muted">
                  <Icon name="ChevronRight" size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}