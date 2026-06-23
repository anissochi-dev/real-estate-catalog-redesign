import { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import SchemaOrg, { makeItemListSchema, makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { fetchDistricts, District } from '@/lib/api';
import { getSiteUrl } from '@/lib/siteUrl';

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
    return allDistricts
      .filter(d => !d.is_okrug && d.parent_id === districtData.id)
      .map(d => d.name);
  }, [isOkrug, districtData, allDistricts]);

  const placeLabel = isOkrug ? 'округ' : 'район';

  // SEO meta
  useEffect(() => {
    if (!districtName) return;
    const company = settings.company_name || '';
    const placeName = districtData?.name || districtName;
    const title = isOkrug
      ? `Коммерческая недвижимость — ${placeName}, ${city}${company ? ` | ${company}` : ''}`
      : `Коммерческая недвижимость — район ${placeName}, ${city}${company ? ` | ${company}` : ''}`;
    document.title = title;
    const desc = isOkrug
      ? `Аренда и продажа коммерческой недвижимости в ${placeName} (${city}). Офисы, склады, торговые помещения и другие объекты во всех районах округа.`
      : `Аренда и продажа коммерческой недвижимости в районе ${placeName}, ${city}. Офисы, склады, торговые помещения и другие объекты.`;
    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.querySelector(sel);
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:type"]', 'content', 'website');
    const siteOrigin = (settings.site_url || '').replace(/\/$/, '') || window.location.origin;
    setMeta('meta[property="og:url"]', 'content', siteOrigin + window.location.pathname);
    // canonical
    let canon = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon); }
    canon.href = siteOrigin + window.location.pathname;
    return () => { document.title = company; };
  }, [districtName, city, settings.company_name, settings.site_url, isOkrug, districtData]);

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

    // Для округа — объекты всех его районов
    if (isOkrug) {
      if (okrugChildNames.length === 0) return [];
      const names = okrugChildNames.map(n => n.toLowerCase());
      return properties.filter(p => {
        const d = (p.district || '').toLowerCase();
        const a = (p.address || '').toLowerCase();
        return names.some(n => d.includes(n) || a.includes(n));
      });
    }

    // Обычный район — по точному названию
    const q = exactName.toLowerCase();
    return properties.filter(p =>
      (p.district || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  }, [properties, districtData, districtName, isOkrug, okrugChildNames]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      <SchemaOrg schema={breadcrumbSchema} id={`district-bc-${district}`} />
      <SchemaOrg schema={itemListSchema} id={`district-list-${district}`} />

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-700 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="mb-4">
            <Breadcrumbs
              items={[
                { label: 'Главная', to: '/' },
                { label: 'Каталог', to: '/catalog' },
                { label: placeTitle },
              ]}
              light
            />
          </div>
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon name="MapPin" size={28} className="text-white" />
            </div>
            <div>
              <h1 className="font-display font-900 text-2xl md:text-3xl leading-tight mb-1">
                Коммерческая недвижимость — {placeTitle}
              </h1>
              <h2 className="font-display font-600 text-base text-white/75 mb-2 leading-snug">
                Аренда и продажа объектов в {isOkrug ? displayName : `районе ${displayName}`}, {city}
              </h2>
              <p className="text-white/70 text-sm max-w-2xl leading-relaxed">
                {items.length > 0
                  ? `В базе ${items.length} активных объектов в этом ${placeLabel}е — офисы, торговые площади, склады и другие.`
                  : `Актуальные объекты коммерческой недвижимости в ${isOkrug ? displayName : `районе ${displayName}`}.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Панель статистики */}
      <div className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-muted-foreground">
            <h3 className="inline font-semibold text-foreground">{placeTitle}</h3>
            {' '}— найдено <span className="font-semibold text-foreground">{items.length}</span> объектов
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/catalog?search=${encodeURIComponent(displayName)}`)}
              className="text-xs text-brand-blue font-semibold flex items-center gap-1 hover:underline"
            >
              <Icon name="SlidersHorizontal" size={13} />
              Фильтры
            </button>
            <button
              onClick={() => navigate('/catalog')}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Icon name="LayoutGrid" size={13} />
              Все районы
            </button>
          </div>
        </div>
      </div>

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
            <div className="mt-12 p-6 bg-white rounded-2xl border border-border">
              <h2 className="font-display font-700 text-lg mb-3">
                О коммерческой недвижимости: {isOkrug ? displayName : `район ${displayName}`}
              </h2>
              {aiLoading && !aiText && !districtData?.description ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-3.5 bg-muted rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {aiText || districtData?.description || `Актуальные объекты коммерческой недвижимости в ${isOkrug ? displayName : `районе ${displayName}`}, ${city} — офисы, торговые площади, склады, производственные помещения и готовый бизнес.`}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}