import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useSeoH1 } from '@/components/SeoHead';
import AIMatchModal from '@/components/AIMatchModal';
import { useSettings } from '@/contexts/SettingsContext';

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

const DEAL_H1: Record<string, string> = {
  sale: 'Продажа коммерческой недвижимости в Краснодаре',
  rent: 'Аренда коммерческой недвижимости в Краснодаре',
  business: 'Готовый бизнес в Краснодаре — актуальные предложения',
};

const TYPE_H1: Record<string, Record<string, string>> = {
  office:       { all: 'Офисы в Краснодаре', rent: 'Аренда офисов в Краснодаре', sale: 'Продажа офисов в Краснодаре' },
  retail:       { all: 'Торговые площади в Краснодаре', rent: 'Торговые площади в аренду в Краснодаре', sale: 'Продажа торговых помещений в Краснодаре' },
  warehouse:    { all: 'Склады в Краснодаре', rent: 'Аренда складов в Краснодаре', sale: 'Продажа складов в Краснодаре' },
  restaurant:   { all: 'Рестораны и кафе в Краснодаре', rent: 'Аренда помещений под общепит в Краснодаре', sale: 'Рестораны и кафе на продажу в Краснодаре' },
  hotel:        { all: 'Гостиницы в Краснодаре', rent: 'Аренда гостиниц в Краснодаре', sale: 'Продажа гостиниц в Краснодаре' },
  business:     { all: 'Готовый бизнес в Краснодаре', rent: 'Готовый бизнес в Краснодаре', sale: 'Продажа готового бизнеса в Краснодаре', business: 'Готовый бизнес в Краснодаре — актуальные предложения' },
  gab:          { all: 'Готовый арендный бизнес (ГАБ) в Краснодаре', rent: 'ГАБ в аренду в Краснодаре', sale: 'Продажа готового арендного бизнеса в Краснодаре' },
  production:   { all: 'Производственные помещения в Краснодаре', rent: 'Аренда производственных помещений в Краснодаре', sale: 'Продажа производственных помещений в Краснодаре' },
  land:         { all: 'Земельные участки в Краснодаре', rent: 'Аренда земельных участков в Краснодаре', sale: 'Продажа земельных участков в Краснодаре' },
  building:     { all: 'Отдельно стоящие здания в Краснодаре', rent: 'Аренда зданий в Краснодаре', sale: 'Продажа зданий в Краснодаре' },
  free_purpose: { all: 'Помещения свободного назначения в Краснодаре', rent: 'Аренда помещений свободного назначения', sale: 'Продажа помещений свободного назначения' },
  car_service:  { all: 'Автосервисы в Краснодаре', rent: 'Аренда автосервисов в Краснодаре', sale: 'Продажа автосервисов в Краснодаре' },
};

function buildCatalogH1(deal: string, type: string): string {
  if (type !== 'all' && TYPE_H1[type]) {
    return TYPE_H1[type][deal] || TYPE_H1[type].all;
  }
  return DEAL_H1[deal] || 'Каталог коммерческой недвижимости в Краснодаре';
}

export default function CatalogPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: CatalogPageProps) {
  const h1Base = useSeoH1('Каталог коммерческой недвижимости в Краснодаре');
  const { settings } = useSettings();
  const PAGE_SIZE = settings.catalog_page_size ?? 20;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dealFilter, setDealFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [minArea, setMinArea] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);

  const h1 = buildCatalogH1(dealFilter, typeFilter) || h1Base;

  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

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
        (p.address || '').toLowerCase().includes(q) ||
        (p.district || '').toLowerCase().includes(q)
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
      case 'newest':
        result.sort((a, b) => {
          // Приоритет: недавно отредактированные → обновлённые → созданные
          const tSrc = (p: typeof a) => p.lastEditedAt || p.updatedAt || p.createdAt;
          const ta = tSrc(a) ? new Date(tSrc(a)!).getTime() : 0;
          const tb = tSrc(b) ? new Date(tSrc(b)!).getTime() : 0;
          return tb - ta;
        });
        break;
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

      {/* ── ИИ-поиск ── */}
      <div className="hero-bg text-white">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <form
            onSubmit={e => { e.preventDefault(); if (aiQuery.trim()) setAiOpen(true); }}
            className="flex gap-2 max-w-2xl"
          >
            <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-2.5 backdrop-blur-sm focus-within:border-white/60 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
                <Icon name="Sparkles" size={14} className="text-white" />
              </div>
              <input
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                placeholder="Опишите нужный объект — ИИ подберёт варианты…"
                aria-label="ИИ-поиск объекта"
                className="bg-transparent text-white placeholder:text-white/55 outline-none w-full text-sm min-w-0"
              />
              {aiQuery && (
                <button type="button" onClick={() => setAiQuery('')} className="text-white/50 hover:text-white/80 flex-shrink-0">
                  <Icon name="X" size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="btn-orange text-white px-4 sm:px-5 py-2.5 rounded-xl font-semibold font-display text-sm flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px]"
            >
              <Icon name="Sparkles" size={14} />
              <span className="hidden sm:inline">Найти с ИИ</span>
              <span className="sm:hidden">ИИ</span>
            </button>
          </form>
          <p className="text-[11px] text-white/50 mt-1.5">Опишите задачу обычным языком — ИИ подберёт подходящие объекты</p>
        </div>
      </div>

      {/* ── Табы + фильтры ── */}
      <div className="bg-white border-b border-border sticky top-16 z-30">
        <div className="container mx-auto px-4">

          {/* Табы тип сделки */}
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
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
            <div className="flex-1" />
            {/* Кнопка фильтров справа */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 my-1.5 rounded-lg text-xs font-semibold transition-all border
                ${showFilters || dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice
                  ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                  : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'
                }`}
            >
              <Icon name="SlidersHorizontal" size={14} />
              Фильтры
              {(dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice) && (
                <span className="w-4 h-4 rounded-full bg-brand-blue text-white text-[10px] flex items-center justify-center">
                  {[dealFilter !== 'all', typeFilter !== 'all', !!minArea, !!maxPrice].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Раскрытые фильтры */}
          {showFilters && (
            <div className="pb-4 pt-1 border-t border-border animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">

                {/* Тип объекта */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Тип объекта</div>
                  <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors"
                  >
                    {PROPERTY_TYPES.map(pt => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Площадь и цена */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">От м²</div>
                    <input type="number" value={minArea} onChange={e => setMinArea(e.target.value)}
                      placeholder="50"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">До цены (млн)</div>
                    <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors" />
                  </div>
                </div>

                {/* Сортировка */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Сортировка</div>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm outline-none focus:border-brand-blue transition-colors">
                    <option value="newest">Сначала свежие</option>
                    <option value="price_asc">Цена: по возрастанию</option>
                    <option value="price_desc">Цена: по убыванию</option>
                    <option value="area_asc">Площадь: по возрастанию</option>
                  </select>
                </div>
              </div>

              {/* Сброс */}
              {(dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice) && (
                <button
                  onClick={() => { setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); }}
                  className="mt-3 text-xs text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80"
                >
                  <Icon name="X" size={12} /> Сбросить все фильтры
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Breadcrumbs items={[
            { label: 'Главная', to: '/' },
            { label: 'Каталог' },
          ]} />
        </div>
        <h1 className="font-display font-900 text-2xl md:text-3xl text-foreground mb-4">{h1}</h1>
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-muted-foreground">
            Найдено <span className="font-semibold text-foreground">{filtered.length}</span> объектов
            {filtered.length > PAGE_SIZE && (
              <span> · показаны {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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