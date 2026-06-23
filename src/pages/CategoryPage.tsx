import { useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Property } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import AIMatchModal from '@/components/AIMatchModal';
import SchemaOrg, { makeItemListSchema, makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { getSiteUrl } from '@/lib/siteUrl';
import { catalogCategoryUrl } from '@/lib/categories';
import { fetchDistricts, District } from '@/lib/api';
import { getOkrugChildNames } from '@/lib/districts';
import DistrictOptions from '@/components/DistrictOptions';

const CATEGORY_SEO_URL = 'https://functions.poehali.dev/4f6d05ce-e38c-4e10-8a8b-f282e1ed2ddd';

type CatSort = 'newest' | 'price_asc' | 'price_desc' | 'area_asc';

interface Props {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
}

const CATEGORY_META: Record<string, {
  labelRu: string;
  icon: string;
  gradient: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  h5: string;
  description: string;
  features: string[];
}> = {
  office: {
    labelRu: 'Офисы',
    icon: 'Building2',
    gradient: 'from-blue-500 to-indigo-600',
    h1: 'Аренда и продажа офисов в Краснодаре',
    h2: 'Офисные помещения в Краснодаре — подбор под ваш бизнес',
    h3: 'Аренда офисов в Краснодаре',
    h4: 'Офисы в бизнес-центрах и отдельных зданиях',
    h5: 'Параметры и цены на офисы',
    description: 'Офисные помещения в Краснодаре на любой бюджет — от небольших кабинетов до целых этажей в бизнес-центрах. Помогаем подобрать офис в центре города, деловых кварталах или на периферии с удобной парковкой.',
    features: ['Помещения от 15 до 3000 м²', 'Бизнес-центры класса A, B и C', 'Открытая планировка и кабинетная', 'Инфраструктура: переговорные, кухни, reception'],
  },
  retail: {
    labelRu: 'Торговые помещения',
    icon: 'ShoppingBag',
    gradient: 'from-orange-500 to-rose-500',
    h1: 'Торговые помещения в аренду и продажу в Краснодаре',
    h2: 'Торговые площади в Краснодаре — первая линия и ТЦ',
    h3: 'Торговые площади в аренду в Краснодаре',
    h4: 'Магазины и шоурумы в торговых центрах',
    h5: 'Параметры и условия аренды торговых помещений',
    description: 'Торговые площади на первых линиях улиц, в торговых центрах, жилых комплексах и отдельно стоящих зданиях. Идеально для магазинов, шоурумов, аптек и бутиков.',
    features: ['1-я и 2-я линия улиц', 'Витринные окна и отдельные входы', 'Высокий пешеходный и автомобильный трафик', 'Помещения с готовым торговым оборудованием'],
  },
  warehouse: {
    labelRu: 'Складские помещения',
    icon: 'Warehouse',
    gradient: 'from-slate-500 to-zinc-700',
    h1: 'Складские помещения в аренду в Краснодаре',
    h2: 'Склады и складские комплексы в Краснодаре и пригороде',
    h3: 'Аренда складов в Краснодаре',
    h4: 'Отапливаемые и холодильные склады',
    h5: 'Площади и ставки аренды складских помещений',
    description: 'Современные склады и складские комплексы в Краснодаре и пригороде — от небольших боксов до логистических центров. Удобный подъезд для фур, ворота секционные, охрана.',
    features: ['Стеллажное хранение и ответственное хранение', 'Ворота с пандусом и рампой', 'Отапливаемые и холодильные склады', 'Охраняемая территория и видеонаблюдение'],
  },
  restaurant: {
    labelRu: 'Помещения для общепита',
    icon: 'UtensilsCrossed',
    gradient: 'from-amber-500 to-red-500',
    h1: 'Помещения под кафе, рестораны и общепит в Краснодаре',
    h2: 'Открыть кафе или ресторан в Краснодаре — готовые помещения',
    h3: 'Рестораны и кафе на продажу в Краснодаре',
    h4: 'Помещения с вентиляцией и вытяжкой для общепита',
    h5: 'Цены и условия аренды помещений под общепит',
    description: 'Готовые и чистовые помещения для открытия кафе, ресторанов, баров, пекарен и фастфуда в Краснодаре. Объекты с вытяжкой, электрической мощностью и разрешённым использованием.',
    features: ['Готовые кухни и вентиляция', 'Высокий трафик и парковка', 'Наружная реклама и вывески', 'Помещения с действующим бизнесом'],
  },
  hotel: {
    labelRu: 'Гостиницы и мини-отели',
    icon: 'BedDouble',
    gradient: 'from-pink-500 to-fuchsia-600',
    h1: 'Гостиницы и мини-отели в продажу и аренду в Краснодаре',
    h2: 'Гостиничный бизнес в Краснодаре — продажа и аренда',
    h3: 'Мини-отели и хостелы в Краснодаре',
    h4: 'Действующие гостиницы с персоналом и клиентской базой',
    h5: 'Номерной фонд, загрузка и доходность отелей',
    description: 'Действующие и готовые к запуску гостиницы, мини-отели, хостелы и апарт-отели в Краснодаре. Готовые бизнесы с персоналом и клиентской базой.',
    features: ['Готовый гостиничный бизнес', 'Апарт-комплексы и хостелы', 'Объекты с документами и разрешениями', 'Центральные и курортные локации'],
  },
  business: {
    labelRu: 'Готовый бизнес',
    icon: 'Briefcase',
    gradient: 'from-violet-500 to-purple-700',
    h1: 'Продажа готового бизнеса в Краснодаре',
    h2: 'Готовый бизнес в Краснодаре — актуальные предложения',
    h3: 'Купить готовый бизнес в Краснодаре',
    h4: 'Бизнес с подтверждёнными доходами и документами',
    h5: 'Стоимость и окупаемость готового бизнеса',
    description: 'Готовый бизнес с оборудованием, клиентской базой, персоналом и подтверждёнными доходами. Кафе, магазины, производства, сервисные компании — проверенные объекты с документами.',
    features: ['Подтверждённая выручка и прибыль', 'Полный пакет документов', 'Бизнес с историей и репутацией', 'Поддержка при передаче бизнеса'],
  },
  gab: {
    labelRu: 'ГАБ (готовый арендный бизнес)',
    icon: 'TrendingUp',
    gradient: 'from-emerald-500 to-teal-600',
    h1: 'ГАБ — готовый арендный бизнес в Краснодаре',
    h2: 'Популярные категории: офисы, склады, торговые площади, рестораны',
    h3: 'Инвестиции в готовый арендный бизнес',
    h4: 'ГАБ с сетевыми арендаторами — Краснодар',
    h5: 'Доходность и окупаемость арендного бизнеса',
    description: 'Инвестиционные объекты с действующими долгосрочными арендаторами. Стабильный пассивный доход с первого дня владения. Окупаемость 8–12 лет.',
    features: ['Арендаторы — сетевые федеральные компании', 'Долгосрочные договоры аренды от 3 лет', 'Прозрачная финансовая отчётность', 'Окупаемость 8–12 лет'],
  },
  production: {
    labelRu: 'Производственные помещения',
    icon: 'Factory',
    gradient: 'from-stone-500 to-neutral-700',
    h1: 'Аренда производственных помещений в Краснодаре',
    h2: 'Производственные цеха и базы в Краснодаре',
    h3: 'Аренда цехов и мастерских в Краснодаре',
    h4: 'Промышленные помещения с кранами и высокими потолками',
    h5: 'Мощность электроснабжения и технические параметры',
    description: 'Производственные цеха, мастерские, технические базы и промышленные объекты в Краснодаре и пригороде. Высокие потолки, мощное электроснабжение, удобный подъезд для грузового транспорта.',
    features: ['Потолки от 5 до 15 метров', 'Электроснабжение 3-фаза от 50 кВт', 'Краны-балки и тельферы', 'Промышленные зоны и отдельные въезды'],
  },
  land: {
    labelRu: 'Земельные участки',
    icon: 'Trees',
    gradient: 'from-lime-500 to-green-700',
    h1: 'Продажа коммерческих земельных участков в Краснодаре',
    h2: 'Земельные участки под коммерческое строительство',
    h3: 'Продажа земли под бизнес в Краснодарском крае',
    h4: 'Участки с коммуникациями и разрешёнными видами использования',
    h5: 'Площадь, стоимость и категория земельных участков',
    description: 'Земельные участки под коммерческое строительство, склады, производство, торговлю в Краснодаре и Краснодарском крае. Участки с подведёнными коммуникациями и разрешённым использованием.',
    features: ['ИЖС, КФХ, промышленные категории', 'Подъезд и коммуникации', 'Участки с проектами застройки', 'Первая линия и трассовые участки'],
  },
  building: {
    labelRu: 'Отдельно стоящие здания',
    icon: 'Landmark',
    gradient: 'from-sky-500 to-blue-700',
    h1: 'Продажа и аренда отдельно стоящих зданий в Краснодаре',
    h2: 'Отдельно стоящие здания под офис или бизнес в Краснодаре',
    h3: 'Продажа зданий в Краснодаре',
    h4: 'Здания с собственной территорией и парковкой',
    h5: 'Площадь, этажность и стоимость зданий',
    description: 'Административные здания, офисные центры, торговые здания и особняки под бизнес в Краснодаре. Собственная территория, парковка и независимость от управляющих компаний.',
    features: ['Собственная парковка и территория', 'Независимая инфраструктура', 'Возможность брендирования фасада', 'Исторические и новые здания'],
  },
  free_purpose: {
    labelRu: 'Помещения свободного назначения',
    icon: 'Shuffle',
    gradient: 'from-cyan-500 to-teal-700',
    h1: 'Помещения свободного назначения в Краснодаре',
    h2: 'Универсальные коммерческие помещения в Краснодаре',
    h3: 'Аренда помещений свободного назначения',
    h4: 'Помещения для медицины, спорта, образования и торговли',
    h5: 'Площадь и стоимость помещений свободного назначения',
    description: 'Универсальные коммерческие помещения без ограничений по виду деятельности. Подходят для медицины, образования, спорта, торговли, сервиса и многих других видов бизнеса.',
    features: ['Без ограничений по виду деятельности', 'Возможна перепланировка', 'На первых и цокольных этажах', 'Оптимальное соотношение цена/качество'],
  },
  car_service: {
    labelRu: 'Автосервисы',
    icon: 'Wrench',
    gradient: 'from-zinc-500 to-slate-800',
    h1: 'Аренда и продажа помещений под автосервис в Краснодаре',
    h2: 'Автосервисы и автобизнес в Краснодаре',
    h3: 'Аренда боксов и помещений для автосервиса',
    h4: 'Готовые автосервисы с оборудованием и клиентской базой',
    h5: 'Площадь, въездные ворота и мощность электрики',
    description: 'Готовые автосервисы и помещения под автобизнес — боксы, мастерские, автомойки, шиномонтажи в Краснодаре. Въездные ворота, ямы, компрессоры, электрика под нагрузку.',
    features: ['Подъёмники и ямы в комплекте', 'Въезд для легковых и грузовых ТС', 'Электрика 380 В от 30 кВт', 'Готовые автосервисы с клиентской базой'],
  },
};

export default function CategoryPage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare }: Props) {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const city = settings.main_city || 'Краснодар';
  const [aiQuery, setAiQuery] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = settings.category_page_size ?? 20;
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

  useEffect(() => { fetchDistricts().then(setDistricts); }, []);

  const meta = type ? CATEGORY_META[type] : null;

  useEffect(() => {
    if (!meta) return;
    const company = settings.company_name || 'BIZNEST';
    const title = `${meta.h1} | ${company}`;
    document.title = title;

    const setMeta = (sel: string, attr: string, val: string) => {
      let el = document.querySelector(sel);
      if (!el) { el = document.createElement('meta'); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };

    setMeta('meta[name="description"]', 'content', meta.description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
    setMeta('meta[property="og:type"]', 'content', 'website');
    setMeta('meta[property="og:url"]', 'content', `${settings.site_url || ''}${window.location.pathname}`);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', meta.description);

    return () => {
      document.title = company;
    };
  }, [meta, settings.company_name, settings.site_url]);

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
      <SchemaOrg schema={itemListSchema} id={`category-${type}`} />
      <SchemaOrg schema={breadcrumbSchema} id={`category-bc-${type}`} />

      {/* Hero-шапка категории */}
      <div className={`bg-gradient-to-br ${meta.gradient} text-white`}>
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="mb-4">
            <Breadcrumbs
              items={[
                { label: 'Главная', to: '/' },
                { label: 'Каталог', to: '/catalog' },
                { label: meta.labelRu, to: catalogCategoryUrl(type!) },
              ]}
              light
            />
          </div>
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon name={meta.icon} size={28} className="text-white" />
            </div>
            <div>
              <h1 className="font-display font-900 text-2xl md:text-3xl leading-tight mb-1">
                {meta.h1}
              </h1>
              <h2 className="font-display font-600 text-base text-white/75 mb-2 leading-snug">
                {meta.h2}
              </h2>
              <p className="text-white/70 text-sm max-w-2xl leading-relaxed">
                {meta.description}
              </p>
            </div>
          </div>

          {/* Фичи — H4 как семантические подзаголовки */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {meta.features.map((f, i) => (
              <div key={i} className="flex items-start gap-2 bg-white/10 rounded-xl px-3 py-2.5">
                <Icon name="CheckCircle2" size={14} className="text-white/80 mt-0.5 flex-shrink-0" />
                <h4 className="text-xs text-white/90 leading-snug font-normal">{f}</h4>
              </div>
            ))}
          </div>

          {/* ИИ-поиск */}
          <form
            onSubmit={e => { e.preventDefault(); if (aiQuery.trim()) setAiOpen(true); }}
            className="flex gap-2 max-w-2xl mt-6"
          >
            <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-2.5 backdrop-blur-sm focus-within:border-white/60 transition-colors">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
                <Icon name="Sparkles" size={14} className="text-white" />
              </div>
              <input
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                placeholder={`Опишите нужный объект из раздела «${meta.labelRu}»…`}
                aria-label="ИИ-поиск объекта"
                className="bg-transparent text-white placeholder:text-white/50 outline-none w-full text-sm min-w-0"
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
          <p className="text-[11px] text-white/45 mt-1.5">Опишите задачу обычным языком — ИИ подберёт подходящие объекты</p>
        </div>
      </div>

      <AIMatchModal open={aiOpen} onClose={() => setAiOpen(false)} initialPrompt={aiQuery} autoSubmit={!!aiQuery.trim()} />

      {/* Описание для поисковых систем */}
      <div className="bg-white border-b border-border">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground">
              <h3 className="inline font-semibold text-foreground">{meta.h3}</h3>{' '}—{' '}
              найдено <span className="font-semibold text-foreground">{items.length}</span> объектов
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

      {/* Список объектов */}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {pagedItems.map((property, i) => (
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

        {/* SEO-текст внизу — показывается ВСЕГДА, в т.ч. при пустой категории */}
        <div className="mt-12 p-6 bg-white rounded-2xl border border-border">
          <h2 className="font-display font-700 text-lg mb-1">{meta.h2}</h2>
          <h5 className="text-sm text-brand-blue font-medium mb-3">{meta.h5}</h5>

          {/* AI-текст или скелетон или статический фолбэк */}
          {aiSeoLoading && !aiSeoText ? (
            <div className="space-y-2 mb-4">
              {[1, 2, 3].map(i => (
                <div key={i} className={`h-3.5 bg-muted rounded animate-pulse ${i === 3 ? 'w-2/3' : 'w-full'}`} />
              ))}
            </div>
          ) : aiSeoText ? (
            <div className="text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-line">
              {aiSeoText}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {meta.description} Наша компания специализируется на подборе коммерческой недвижимости
              в {city}е с {settings.company_since_year || 2007} года. Мы помогаем как покупателям,
              так и арендаторам найти оптимальный объект с учётом бюджета, требований к площади и расположению.
            </p>
          )}

          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Другие категории</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_META)
              .filter(([k]) => k !== type)
              .map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => navigate(catalogCategoryUrl(k))}
                  className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-brand-blue hover:text-brand-blue transition-colors"
                >
                  {v.labelRu}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}