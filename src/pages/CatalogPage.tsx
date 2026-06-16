import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Property } from '@/App';
import Icon from '@/components/ui/icon';
import MaxSubscribeWidget from '@/components/MaxSubscribeWidget';
import { useSeoH1 } from '@/components/SeoHead';
import AIMatchModal from '@/components/AIMatchModal';
import { useSettings } from '@/contexts/SettingsContext';
import { makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { fetchDistricts, District } from '@/lib/api';
import { getSiteUrl } from '@/lib/siteUrl';
import { formatPrice } from '@/components/PropertyCard';
import CatalogHero from './catalog/CatalogHero';
import CatalogFilters from './catalog/CatalogFilters';
import CatalogMap from './catalog/CatalogMap';
import CatalogResults from './catalog/CatalogResults';

interface CatalogPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  allLoaded?: boolean;
}

type SortOption = 'price_asc' | 'price_desc' | 'area_asc' | 'newest';

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
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapSelected, setMapSelected] = useState<Property | null>(null);

  const isStubCoord = (n: number) => Math.abs(n - Math.round(n)) < 1e-6 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9;

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

  const mapPoints = useMemo(
    () => filtered
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
    [filtered],
  );

  const LOAD_STEP = 20;
  const [visibleCount, setVisibleCount] = useState(LOAD_STEP);

  // Сброс при смене фильтров/поиска
  useEffect(() => { setVisibleCount(LOAD_STEP); }, [search, sortBy, minArea, maxPrice, districtFilter, dealFilter, typeFilter]);

  const pageItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  const siteUrl = getSiteUrl(settings.site_url);
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

      <CatalogHero
        aiQuery={aiQuery}
        onAiQueryChange={setAiQuery}
        onAiSubmit={() => setAiOpen(true)}
      />

      <CatalogFilters
        dealFilter={dealFilter}
        typeFilter={typeFilter}
        districtFilter={districtFilter}
        minArea={minArea}
        maxPrice={maxPrice}
        sortBy={sortBy}
        showFilters={showFilters}
        showMap={showMap}
        districts={districts}
        onDealChange={setDealFilter}
        onTypeChange={setTypeFilter}
        onDistrictChange={setDistrictFilter}
        onMinAreaChange={setMinArea}
        onMaxPriceChange={setMaxPrice}
        onSortChange={setSortBy}
        onToggleFilters={() => setShowFilters(!showFilters)}
        onToggleMap={() => { setShowMap(v => !v); setMapSelected(null); }}
        onResetFilters={() => { setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); setDistrictFilter('all'); }}
      />

      {/* ── Кнопка уведомлений MAX — между фильтрами и результатами ── */}
      <div className="container mx-auto px-4 py-2">
        <button
          onClick={() => setShowSubscribe(true)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-brand-blue/20 bg-brand-blue/[0.03] hover:bg-brand-blue/[0.07] hover:border-brand-blue/40 transition-all group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-blue flex items-center justify-center flex-shrink-0">
              <Icon name="Bell" size={13} className="text-white" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-foreground">Уведомления в MAX</span>
              <span className="text-xs text-muted-foreground ml-2">Новые объекты — сразу в мессенджер</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-brand-blue shrink-0">
            Подписаться
            <Icon name="ChevronRight" size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>

      {showMap && (
        <CatalogMap
          mapPoints={mapPoints}
          mapSelected={mapSelected}
          city={settings.main_city || 'Краснодар'}
          onClose={() => { setShowMap(false); setMapSelected(null); }}
          onPointClick={handleMapPointClick}
          onDeselectPoint={() => setMapSelected(null)}
        />
      )}

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      <CatalogResults
        h1={h1}
        filtered={filtered}
        pageItems={pageItems}
        favorites={favorites}
        compareList={compareList}
        visibleCount={visibleCount}
        hasMore={hasMore}
        allLoaded={allLoaded}
        dealFilter={dealFilter}
        typeFilter={typeFilter}
        catalogBreadcrumbSchema={catalogBreadcrumbSchema}
        loadStep={LOAD_STEP}
        onToggleFavorite={onToggleFavorite}
        onToggleCompare={onToggleCompare}
        onLoadMore={() => setVisibleCount(v => v + LOAD_STEP)}
      />

      {/* Модальное окно подписки */}
      <MaxSubscribeWidget
        open={showSubscribe}
        onClose={() => setShowSubscribe(false)}
        initialCategories={typeFilter !== 'all' ? [typeFilter] : []}
        initialDealType={dealFilter !== 'all' ? dealFilter : 'all'}
        city={settings.main_city || 'Краснодар'}
      />
    </div>
  );
}