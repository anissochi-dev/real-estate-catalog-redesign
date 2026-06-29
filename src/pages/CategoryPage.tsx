import { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import AIMatchModal from '@/components/AIMatchModal';
import SchemaOrg, { makeItemListSchema, makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { getSiteUrl } from '@/lib/siteUrl';
import { fetchDistricts, District } from '@/lib/api';
import { getOkrugChildNames } from '@/lib/districts';
import { CATEGORY_META, CATEGORY_SEO_URL, CatSort } from './category/categoryMeta';
import CategoryHero from './category/CategoryHero';
import CategoryToolbar from './category/CategoryToolbar';
import CategorySeoBlock from './category/CategorySeoBlock';
import SeoHead from '@/components/SeoHead';
import CatalogMap from './catalog/CatalogMap';

interface Props {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

export default function CategoryPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: Props) {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const city = settings.main_city || 'Краснодар';
  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = settings.category_page_size ?? 21;
  const [aiSeoText, setAiSeoText] = useState('');
  const [aiSeoLoading, setAiSeoLoading] = useState(false);

  // Фильтры прямо на странице категории (вариант А)
  const [showFilters, setShowFilters] = useState(false);
  const [dealFilter, setDealFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [minArea, setMinArea] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<CatSort>('newest');
  const [districts, setDistricts] = useState<District[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [mapSelected, setMapSelected] = useState<Property | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

  const meta = type ? CATEGORY_META[type] : null;

  // Загружаем AI SEO-текст — один раз при заходе на категорию.
  // Текст кешируется на сервере, поэтому GPT вызывается только при первом посещении.
  useEffect(() => {
    if (!type || !CATEGORY_SEO_URL) return;
    setAiSeoText('');
    setAiSeoLoading(true);
    fetch(`${CATEGORY_SEO_URL}?category=${encodeURIComponent(type)}&city=${encodeURIComponent(city)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.text) setAiSeoText(d.text); })
      .catch(() => {})
      .finally(() => setAiSeoLoading(false));
  }, [type, city]);

  const items = useMemo(() => {
    if (!type) return [];
    let result = properties.filter(p => String(p.type) === type);

    if (dealFilter !== 'all') result = result.filter(p => String(p.deal) === dealFilter);

    if (districtFilter !== 'all') {
      if (districtFilter.startsWith('okrug:')) {
        const okrugId = Number(districtFilter.slice(6));
        const okrug = districts.find(d => d.id === okrugId && d.is_okrug);
        const names = okrug ? getOkrugChildNames(districts, okrug) : [];
        result = result.filter(p =>
          names.some(n => (p.district || '').toLowerCase().includes(n.toLowerCase()))
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
      case 'price_asc': result = [...result].sort((a, b) => a.price - b.price); break;
      case 'price_desc': result = [...result].sort((a, b) => b.price - a.price); break;
      case 'area_asc': result = [...result].sort((a, b) => a.area - b.area); break;
      case 'newest': break;
    }

    return result;
  }, [properties, type, dealFilter, districtFilter, minArea, maxPrice, sortBy, districts]);

  const totalPages = Math.ceil(items.length / CAT_PAGE_SIZE);
  const pagedItems = items.slice((catPage - 1) * CAT_PAGE_SIZE, catPage * CAT_PAGE_SIZE);

  const mapPoints = useMemo(() => items
    .filter(p => p.lat && p.lng)
    .map(p => ({ id: p.id, lat: Number(p.lat), lng: Number(p.lng), title: p.title, caption: `${p.area} м²`, type: p.type, isHot: !!p.isHot })),
    [items],
  );

  // Сброс на первую страницу при смене фильтров
  useEffect(() => { setCatPage(1); }, [dealFilter, districtFilter, minArea, maxPrice, sortBy]);

  const hasActiveFilters = dealFilter !== 'all' || districtFilter !== 'all' || !!minArea || !!maxPrice;

  const resetFilters = () => {
    setDealFilter('all'); setDistrictFilter('all'); setMinArea(''); setMaxPrice(''); setSortBy('newest');
  };

  // rel=prev/next для SEO-пагинации
  useEffect(() => {
    const base = `${(settings.site_url || '').replace(/\/$/, '')}/catalog/${type}`;
    const setPaginationLink = (rel: 'prev' | 'next', page: number) => {
      const id = `link-${rel}`;
      let el = document.getElementById(id) as HTMLLinkElement | null;
      if (!el) { el = document.createElement('link'); el.id = id; el.rel = rel; document.head.appendChild(el); }
      el.href = page === 1 ? base : `${base}?page=${page}`;
    };
    const removePaginationLink = (rel: 'prev' | 'next') => {
      document.getElementById(`link-${rel}`)?.remove();
    };
    if (catPage > 1) setPaginationLink('prev', catPage - 1); else removePaginationLink('prev');
    if (catPage < totalPages) setPaginationLink('next', catPage + 1); else removePaginationLink('next');
    return () => { removePaginationLink('prev'); removePaginationLink('next'); };
  }, [catPage, totalPages, type, settings.site_url]);

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <div className="font-display font-700 text-xl mb-2">Категория не найдена</div>
          <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-5 py-2 rounded-xl mt-3">
            В каталог
          </button>
        </div>
      </div>
    );
  }

  const siteUrl = getSiteUrl(settings.site_url);

  const itemListSchema = makeItemListSchema(
    items.slice(0, 20).map(p => ({
      name: p.title,
      url: `${siteUrl}/object/${p.id}`,
      image: p.image || undefined,
      description: p.description ? p.description.slice(0, 160) : undefined,
    })),
    meta.h1,
  );

  const breadcrumbSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: siteUrl },
    { name: 'Каталог', url: `${siteUrl}/catalog` },
    { name: meta.labelRu, url: `${siteUrl}/catalog/${type}` },
  ]);

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        path={`/catalog/${type}`}
        h1={meta.h1}
        title={`${meta.h1} | ${settings.company_name || 'БМН'}`}
        description={meta.description}
        ogImage="https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/files/og-image-1779575751349.png"
      />
      <SchemaOrg schema={itemListSchema} id={`category-${type}`} />
      <SchemaOrg schema={breadcrumbSchema} id={`category-bc-${type}`} />

      {/* Hero-шапка категории */}
      <CategoryHero
        meta={meta}
        type={type}
        aiQuery={aiQuery}
        setAiQuery={setAiQuery}
        setAiOpen={setAiOpen}
      />

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      {/* Описание для поисковых систем */}
      <CategoryToolbar
        meta={meta}
        itemsCount={items.length}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        hasActiveFilters={hasActiveFilters}
        dealFilter={dealFilter}
        setDealFilter={setDealFilter}
        districtFilter={districtFilter}
        setDistrictFilter={setDistrictFilter}
        minArea={minArea}
        setMinArea={setMinArea}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        sortBy={sortBy}
        setSortBy={setSortBy}
        districts={districts}
        resetFilters={resetFilters}
      />

      {/* Split-лэйаут: слева список, справа sticky карта */}
      <div className="flex min-h-0">
        {/* Левая колонка — результаты */}
        <div className="flex-1 min-w-0">
          <div className="container mx-auto px-4 py-8">
            {items.length === 0 ? (
              <div className="text-center py-16">
                <Icon name="Building2" size={40} className="mx-auto mb-4 text-muted-foreground opacity-30" />
                <div className="font-display font-700 text-xl text-foreground mb-2">
                  {hasActiveFilters
                    ? 'По выбранным фильтрам ничего не найдено'
                    : 'Объекты в этой категории появятся скоро'}
                </div>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  {hasActiveFilters
                    ? 'Попробуйте смягчить условия фильтра или сбросить их.'
                    : `Пока в категории «${meta.labelRu}» нет активных объектов. Смотрите другие категории или оставьте заявку.`}
                </p>
                {hasActiveFilters ? (
                  <button onClick={resetFilters} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
                    Сбросить фильтры
                  </button>
                ) : (
                  <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
                    Смотреть все объекты
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {pagedItems.map((property, i) => (
                    <PropertyCard
                      key={property.id}
                      property={property}
                      isFavorite={favorites.includes(property.id)}
                      isCompare={compareList.includes(property.id)}
                      onToggleFavorite={onToggleFavorite}
                      onToggleCompare={onToggleCompare}
                      index={i}
                      highlighted={hoveredId === property.id}
                      onHover={setHoveredId}
                      style={{ animationDelay: `${i * 0.03}s`, opacity: 0 }}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button disabled={catPage === 1} onClick={() => { setCatPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="px-3 py-2 rounded-lg border border-border hover:border-brand-blue disabled:opacity-30 transition-colors">
                      <Icon name="ChevronLeft" size={16} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => { setCatPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${p === catPage ? 'btn-blue text-white' : 'border border-border hover:border-brand-blue'}`}>
                        {p}
                      </button>
                    ))}
                    <button disabled={catPage === totalPages} onClick={() => { setCatPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="px-3 py-2 rounded-lg border border-border hover:border-brand-blue disabled:opacity-30 transition-colors">
                      <Icon name="ChevronRight" size={16} />
                    </button>
                  </div>
                )}
              </>
            )}

            <CategorySeoBlock
              meta={meta}
              type={type}
              city={city}
              companySinceYear={settings.company_since_year}
              aiSeoText={aiSeoText}
              aiSeoLoading={aiSeoLoading}
            />
          </div>
        </div>

        {/* Правая колонка — sticky карта (только десктоп) */}
        <div className="hidden lg:block w-1/2 shrink-0">
          <div className="sticky top-0 h-screen">
            <CatalogMap
              mapPoints={mapPoints}
              mapSelected={mapSelected}
              city={city}
              fullscreen={mapFullscreen}
              highlightedId={hoveredId}
              onClose={() => setMapSelected(null)}
              onPointClick={() => {}}
              onDeselectPoint={() => setMapSelected(null)}
              onFullscreenChange={setMapFullscreen}
              height="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}