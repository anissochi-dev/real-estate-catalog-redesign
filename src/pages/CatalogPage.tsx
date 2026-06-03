import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useSeoH1 } from '@/components/SeoHead';
import AIMatchModal from '@/components/AIMatchModal';
import { useSettings } from '@/contexts/SettingsContext';
import SchemaOrg, { makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { fetchDistricts, District } from '@/lib/api';
import YandexMap from '@/components/YandexMap';
import { formatPrice } from '@/components/PropertyCard';
import { listingSlug } from '@/lib/slug';

interface CatalogPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  allLoaded?: boolean;
}

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

const DEAL_H1: Record<string, string> = {
  sale: 'Продажа коммерческой недвижимости в Краснодаре',
  rent: 'Аренда коммерческой недвижимости в Краснодаре',
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

export default function CatalogPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare, allLoaded = true }: CatalogPageProps) {
  const h1Base = useSeoH1('Каталог коммерческой недвижимости в Краснодаре');
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dealFilter, setDealFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [minArea, setMinArea] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [districts, setDistricts] = useState<District[]>([]);

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

  const h1 = buildCatalogH1(dealFilter, typeFilter) || h1Base;

  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapSelected, setMapSelected] = useState<Property | null>(null);
  const navigate = useNavigate();

  const KRASNODAR_CENTER: [number, number] = [45.0355, 38.9753];
  const isStubCoord = (n: number) => Math.abs(n - Math.round(n)) < 1e-6 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9;

  const mapPoints = useMemo(
    () => properties
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0 && !(isStubCoord(p.lat) && isStubCoord(p.lng)))
      .map(p => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        title: p.title,
        caption: `${formatPrice(p.price, p.deal)} · ${p.area} м²`,
        type: String(p.type),
        isHot: p.isHot,
      })),
    [properties],
  );

  const handleMapPointClick = useCallback((pt: { id: number }) => {
    setMapSelected(prev => prev?.id === pt.id ? prev : properties.find(x => x.id === pt.id) || null);
  }, [properties]);

  // Читаем фильтры из URL при первом рендере
  useEffect(() => {
    const deal = searchParams.get('deal');
    const type = searchParams.get('type');
    const q = searchParams.get('search');
    const district = searchParams.get('district');
    if (deal) setDealFilter(deal);
    if (type) setTypeFilter(type);
    if (q) setSearch(q);
    if (district) setDistrictFilter(district);
  }, [searchParams]);

  // Синхронизируем выбранный deal в URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (dealFilter !== 'all') next.set('deal', dealFilter); else next.delete('deal');
    if (typeFilter !== 'all') next.set('type', typeFilter); else next.delete('type');
    if (districtFilter !== 'all') next.set('district', districtFilter); else next.delete('district');
    setSearchParams(next, { replace: true });
  }, [dealFilter, typeFilter, districtFilter]);

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
    if (districtFilter !== 'all') {
      result = result.filter(p =>
        (p.district || '').toLowerCase().includes(districtFilter.toLowerCase())
      );
    }
    if (minArea) result = result.filter(p => p.area >= Number(minArea));
    if (maxPrice) result = result.filter(p => p.price <= Number(maxPrice) * 1000000);

    switch (sortBy) {
      case 'price_asc': result.sort((a, b) => a.price - b.price); break;
      case 'price_desc': result.sort((a, b) => b.price - a.price); break;
      case 'area_asc': result.sort((a, b) => a.area - b.area); break;
      case 'newest':
        // Не сортируем — берём порядок с сервера (last_edited_at, is_hot, is_new, ...).
        // Иначе при двухэтапной загрузке (быстрые 8 → полный список) топ-N меняется
        // и пользователь видит «дерганье» объектов.
        break;
    }

    return result;
  }, [properties, search, dealFilter, typeFilter, districtFilter, sortBy, minArea, maxPrice]);

  const LOAD_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(LOAD_STEP);

  // Сброс при смене фильтров/поиска
  useEffect(() => { setVisibleCount(LOAD_STEP); }, [search, sortBy, minArea, maxPrice, districtFilter, dealFilter, typeFilter]);

  const pageItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;


  const siteUrl = settings.site_url || 'https://bmn.su';
  const catalogBreadcrumbs = [
    { name: 'Главная', url: siteUrl },
    ...(typeFilter !== 'all' || dealFilter !== 'all'
      ? [{ name: 'Каталог', url: `${siteUrl}/catalog` }]
      : []),
    { name: h1 },
  ];
  const catalogBreadcrumbSchema = makeBreadcrumbSchema(catalogBreadcrumbs);

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
            {/* Кнопка карты */}
            <button
              onClick={() => { setShowMap(v => !v); setMapSelected(null); }}
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
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 my-1.5 rounded-lg text-xs font-semibold transition-all border
                ${showFilters || dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice || districtFilter !== 'all'
                  ? 'border-brand-orange bg-brand-orange text-white'
                  : 'border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white'
                }`}
            >
              <Icon name="SlidersHorizontal" size={14} />
              Фильтры
              {(dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice || districtFilter !== 'all') && (
                <span className="w-4 h-4 rounded-full bg-white text-brand-orange text-[10px] flex items-center justify-center font-bold">
                  {[dealFilter !== 'all', typeFilter !== 'all', !!minArea, !!maxPrice, districtFilter !== 'all'].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Раскрытые фильтры */}
          {showFilters && (
            <div className="pb-4 pt-1 border-t border-border animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3">

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

                {/* Район */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Район</div>
                  <select
                    value={districtFilter}
                    onChange={e => setDistrictFilter(e.target.value)}
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
              {(dealFilter !== 'all' || typeFilter !== 'all' || minArea || maxPrice || districtFilter !== 'all') && (
                <button
                  onClick={() => { setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); setDistrictFilter('all'); }}
                  className="mt-3 text-xs text-brand-orange font-semibold flex items-center gap-1 hover:opacity-80"
                >
                  <Icon name="X" size={12} /> Сбросить все фильтры
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Встроенная карта ── */}
      {showMap && (
        <div className="border-b border-border bg-white" style={{ height: 420 }}>
          <div className="relative h-full">
            {/* Счётчик объектов */}
            <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm">
              <div className="text-xs font-semibold text-brand-blue font-display flex items-center gap-1">
                <Icon name="MapPin" size={12} />
                {settings.main_city || 'Краснодар'}
              </div>
              <div className="text-[10px] text-muted-foreground">{mapPoints.length} объектов на карте</div>
            </div>
            {/* Кнопка закрытия */}
            <button
              onClick={() => { setShowMap(false); setMapSelected(null); }}
              className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Icon name="X" size={12} /> Скрыть
            </button>
            <YandexMap
              points={mapPoints}
              center={mapPoints.length === 0 ? KRASNODAR_CENTER : undefined}
              zoom={11}
              height="100%"
              onPointClick={handleMapPointClick}
            />
            {/* Карточка выбранного объекта */}
            {mapSelected && (
              <div className="absolute bottom-3 left-3 right-3 z-10 bg-white rounded-xl shadow-lg border border-border p-3 flex gap-3 items-start max-w-sm">
                {mapSelected.image && (
                  <img src={mapSelected.image} alt={mapSelected.title} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate mb-0.5">{mapSelected.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate mb-1">{mapSelected.address || mapSelected.district || ''}</div>
                  <div className="text-sm font-display font-700 text-brand-blue">{formatPrice(mapSelected.price, mapSelected.deal)}</div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => navigate(`/object/${listingSlug(mapSelected.title, mapSelected.id)}`)}
                    className="text-[11px] bg-brand-blue text-white px-2.5 py-1 rounded-lg font-semibold hover:bg-brand-blue/90 transition-colors"
                  >
                    Открыть
                  </button>
                  <button onClick={() => setMapSelected(null)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center">
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      {/* Results */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                  onClick={() => setVisibleCount(v => v + LOAD_STEP)}
                  className="btn-orange text-white px-8 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                >
                  <Icon name="ChevronDown" size={16} />
                  Показать ещё {Math.min(LOAD_STEP, filtered.length - visibleCount)} объектов
                </button>
                <div className="text-xs text-muted-foreground">
                  Показано {visibleCount} из {filtered.length}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}