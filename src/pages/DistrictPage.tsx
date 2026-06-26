import { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import SchemaOrg, { makeItemListSchema, makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { fetchDistricts, District } from '@/lib/api';
import { getOkrugChildNames, matchesDistrictNames } from '@/lib/districts';
import { getSiteUrl } from '@/lib/siteUrl';
import DistrictHero from './district/DistrictHero';
import DistrictStatsBar from './district/DistrictStatsBar';
import DistrictSeoBlock from './district/DistrictSeoBlock';
import SeoHead from '@/components/SeoHead';

const DISTRICT_SEO_URL = 'https://functions.poehali.dev/4f6d05ce-e38c-4e10-8a8b-f282e1ed2ddd';
const PAGE_SIZE = 12;

interface Props {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

export default function DistrictPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: Props) {
  const { district } = useParams<{ district: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const city = settings.main_city || 'Краснодар';
  const [page, setPage] = useState(1);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const districtName = district ? decodeURIComponent(district) : '';
  const [districtData, setDistrictData] = useState<District | null>(null);
  const [allDistricts, setAllDistricts] = useState<District[]>([]);

  useEffect(() => {
    if (!district) return;
    fetchDistricts().then(list => {
      setAllDistricts(list);
      const found = list.find(d => d.slug === district);
      setDistrictData(found || null);
    });
  }, [district]);

  const isOkrug = !!districtData?.is_okrug;
  // Названия районов, входящих в округ (для фильтрации объектов и текстов)
  const okrugChildNames = useMemo(() => {
    if (!isOkrug || !districtData) return [];
    return getOkrugChildNames(allDistricts, districtData);
  }, [isOkrug, districtData, allDistricts]);

  const placeLabel = isOkrug ? 'округ' : 'район';

  const placeName = districtData?.name || districtName;
  const seoTitle = districtName
    ? (isOkrug
        ? `Коммерческая недвижимость в ${placeName}, ${city}`
        : `Коммерческая недвижимость в районе ${placeName}, ${city}`)
    : '';
  const seoDescription = districtName
    ? (isOkrug
        ? `Аренда и продажа коммерческой недвижимости в ${placeName} (${city}). Офисы, склады, торговые площади и другие объекты во всех районах округа.`
        : `Аренда и продажа коммерческой недвижимости в районе ${placeName}, ${city}. Офисы, склады, торговые площади и другие объекты.`)
    : '';
  const seoKeywords = districtName
    ? `коммерческая недвижимость ${placeName}, аренда ${placeName}, ${placeName} ${city}, офис ${placeName}, склад ${placeName}`
    : '';

  // Загружаем AI-текст
  useEffect(() => {
    if (!districtName || !DISTRICT_SEO_URL || DISTRICT_SEO_URL.includes('PLACEHOLDER')) return;
    const nameForSeo = districtData?.name || districtName;
    setAiText('');
    setAiLoading(true);
    fetch(`${DISTRICT_SEO_URL}?district=${encodeURIComponent(nameForSeo)}&city=${encodeURIComponent(city)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.text) setAiText(d.text); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [districtName, districtData, city]);

  const items = useMemo(() => {
    if (!districtName) return [];
    const exactName = districtData?.name;
    if (!exactName) return []; // ждём загрузки districtData

    // Для округа — объекты всех его районов, для района — по его названию
    const names = isOkrug ? okrugChildNames : [exactName];
    if (names.length === 0) return [];
    return properties.filter(p => matchesDistrictNames(p.district, p.address, names));
  }, [properties, districtData, districtName, isOkrug, okrugChildNames]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    const base = `${(settings.site_url || '').replace(/\/$/, '')}/district/${district}`;
    const setLink = (rel: 'prev' | 'next', p: number) => {
      const id = `link-district-${rel}`;
      let el = document.getElementById(id) as HTMLLinkElement | null;
      if (!el) { el = document.createElement('link'); el.id = id; el.rel = rel; document.head.appendChild(el); }
      el.href = p === 1 ? base : `${base}?page=${p}`;
    };
    const removeLink = (rel: 'prev' | 'next') => { document.getElementById(`link-district-${rel}`)?.remove(); };
    if (page > 1) setLink('prev', page - 1); else removeLink('prev');
    if (page < totalPages) setLink('next', page + 1); else removeLink('next');
    return () => { removeLink('prev'); removeLink('next'); };
  }, [page, totalPages, district, settings.site_url]);

  const displayName = districtData?.name || districtName;

  const siteUrl = getSiteUrl(settings.site_url);

  // Заголовок места: для округа — просто название (в нём уже есть слово «округ»),
  // для района — «<Название> район»
  const placeTitle = isOkrug ? displayName : `${displayName} район`;

  const breadcrumbSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: siteUrl },
    { name: 'Каталог', url: `${siteUrl}/catalog` },
    { name: placeTitle },
  ]);

  const itemListSchema = makeItemListSchema(
    items.slice(0, 20).map(p => ({
      name: p.title,
      url: `${siteUrl}/object/${p.id}`,
      image: p.image || undefined,
      description: p.description?.slice(0, 160),
    })),
    `Коммерческая недвижимость — ${placeTitle}`,
  );

  if (!districtName) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <div className="font-display font-700 text-xl mb-2">Район не найден</div>
          <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-5 py-2 rounded-xl mt-3">
            В каталог
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {seoTitle && (
        <SeoHead
          path={`/district/${district}`}
          title={seoTitle}
          description={seoDescription}
          h1={seoTitle}
          keywords={seoKeywords}
        />
      )}
      <SchemaOrg schema={breadcrumbSchema} id={`district-bc-${district}`} />
      <SchemaOrg schema={itemListSchema} id={`district-list-${district}`} />

      {/* Hero */}
      <DistrictHero
        placeTitle={placeTitle}
        displayName={displayName}
        isOkrug={isOkrug}
        placeLabel={placeLabel}
        city={city}
        itemsCount={items.length}
      />

      {/* Панель статистики */}
      <DistrictStatsBar
        placeTitle={placeTitle}
        displayName={displayName}
        itemsCount={items.length}
      />

      {/* Объекты */}
      <div className="container mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="MapPin" size={40} className="mx-auto mb-4 text-muted-foreground opacity-30" />
            <div className="font-display font-700 text-xl text-foreground mb-2">
              Объектов в этом {placeLabel}е пока нет
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Попробуйте посмотреть все объекты или выбрать другой {placeLabel}.
            </p>
            <button onClick={() => navigate('/catalog')} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
              Смотреть все объекты
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button disabled={page === 1} onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="px-3 py-2 rounded-lg border border-border hover:border-brand-blue disabled:opacity-30 transition-colors">
                  <Icon name="ChevronLeft" size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${p === page ? 'btn-blue text-white' : 'border border-border hover:border-brand-blue'}`}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="px-3 py-2 rounded-lg border border-border hover:border-brand-blue disabled:opacity-30 transition-colors">
                  <Icon name="ChevronRight" size={16} />
                </button>
              </div>
            )}

            {/* AI SEO-текст */}
            <DistrictSeoBlock
              displayName={displayName}
              isOkrug={isOkrug}
              city={city}
              aiText={aiText}
              aiLoading={aiLoading}
              description={districtData?.description}
            />
          </>
        )}
      </div>
    </div>
  );
}