import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Property } from '@/App';
import MaxSubscribeWidget from '@/components/MaxSubscribeWidget';
import SeoHead, { useSeoH1 } from '@/components/SeoHead';
import AIMatchModal from '@/components/AIMatchModal';
import { useSettings } from '@/contexts/SettingsContext';
import { makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { fetchDistricts, District } from '@/lib/api';
import { getOkrugChildNames } from '@/lib/districts';
import { getSiteUrl } from '@/lib/siteUrl';
import { formatPrice } from '@/components/PropertyCard';
import CatalogHero from './catalog/CatalogHero';
import CatalogFilters from './catalog/CatalogFilters';
import CatalogMap from './catalog/CatalogMap';
import CatalogResults from './catalog/CatalogResults';
import { buildCatalogH1 } from './catalog/catalogH1';

interface CatalogPageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  allLoaded?: boolean;
}

type SortOption = 'price_asc' | 'price_desc' | 'area_asc' | 'newest';

export default function CatalogPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare, allLoaded = true }: CatalogPageProps) {
  const h1Base = useSeoH1('Каталог коммерческой недвижимости в Краснодаре');
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [dealFilter, setDealFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
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
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [mapSelected, setMapSelected] = useState<Property | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

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
      if (districtFilter.startsWith('okrug:')) {
        const okrugId = Number(districtFilter.slice(6));
        const okrug = districts.find(d => d.id === okrugId && d.is_okrug);
        const names = okrug ? getOkrugChildNames(districts, okrug) : [];
        result = result.filter(p =>
          names.some(name => (p.district || '').toLowerCase().includes(name.toLowerCase()))
        );
      } else {
        result = result.filter(p =>
          (p.district || '').toLowerCase().includes(districtFilter.toLowerCase())
        );
      }
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
  }, [properties, search, dealFilter, typeFilter, districtFilter, sortBy, minArea, maxPrice, districts]);

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
      <SeoHead path="/catalog" h1={h1} />

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
        onToggleMap={() => { setShowMap(v => { if (!v) setShowFilters(true); return !v; }); setMapSelected(null); }}
        onResetFilters={() => { setDealFilter('all'); setTypeFilter('all'); setMinArea(''); setMaxPrice(''); setDistrictFilter('all'); }}
        onSubscribe={() => setShowSubscribe(true)}
      />

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      {/* Split-лэйаут: слева список, справа sticky карта */}
      <div className="flex min-h-0">
        {/* Левая колонка — результаты */}
        <div className="flex-1 min-w-0">
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
            hoveredId={hoveredId}
            onToggleFavorite={onToggleFavorite}
            onToggleCompare={onToggleCompare}
            onLoadMore={() => setVisibleCount(v => v + LOAD_STEP)}
            onHover={setHoveredId}
          />
        </div>

        {/* Правая колонка — карта sticky (только десктоп) */}
        <div className="hidden lg:block w-1/2 shrink-0">
          <div className="sticky top-0 h-screen">
            <CatalogMap
              mapPoints={mapPoints}
              mapSelected={mapSelected}
              city={settings.main_city || 'Краснодар'}
              fullscreen={mapFullscreen}
              highlightedId={hoveredId}
              onClose={() => setMapSelected(null)}
              onPointClick={handleMapPointClick}
              onDeselectPoint={() => setMapSelected(null)}
              onFullscreenChange={setMapFullscreen}
              height="100%"
            />
          </div>
        </div>
      </div>

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