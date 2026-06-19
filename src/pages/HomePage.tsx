import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Property, Page } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import { NEWS_URL } from '@/lib/adminApi';
import SeoHead from '@/components/SeoHead';
import SchemaOrg, { makeFaqSchema } from '@/components/SchemaOrg';

const ClientLeadsSection = lazy(() => import('@/components/ClientLeadsSection'));
const AIMatchModal = lazy(() => import('@/components/AIMatchModal'));
const OwnerSubmitModal = lazy(() => import('@/components/OwnerSubmitModal'));

interface PublicStats {
  total: number;
  main_city: string;
  by_category?: Record<string, number>;
  by_deal?: Record<string, number>;
}

interface HomePageProps {
  properties: Property[];
  favorites: number[];
  compareList: number[];
  onToggleFavorite: (id: number) => void;
  onToggleCompare: (id: number) => void;
  onNavigate: (page: Page) => void;
}

const LISTINGS_URL = 'https://functions.poehali.dev/590f7088-530b-4bfb-994e-1047674672fa';

const CATEGORIES = [
  { icon: 'Building2', label: 'Офисы', type: 'office', gradient: 'from-blue-500 to-indigo-600' },
  { icon: 'ShoppingBag', label: 'Магазин, торговое помещение', type: 'retail', gradient: 'from-orange-500 to-rose-500' },
  { icon: 'Warehouse', label: 'Склады', type: 'warehouse', gradient: 'from-slate-500 to-zinc-700' },
  { icon: 'UtensilsCrossed', label: 'Общепит, кафе, ресторан', type: 'restaurant', gradient: 'from-amber-500 to-red-500' },
  { icon: 'BedDouble', label: 'Гостиницы', type: 'hotel', gradient: 'from-pink-500 to-fuchsia-600' },
  { icon: 'Briefcase', label: 'Готовый бизнес', type: 'business', gradient: 'from-violet-500 to-purple-700' },
  { icon: 'TrendingUp', label: 'Готовый арендный бизнес (ГАБ)', type: 'gab', gradient: 'from-emerald-500 to-teal-600' },
  { icon: 'Factory', label: 'Производственные помещения', type: 'production', gradient: 'from-stone-500 to-neutral-700' },
  { icon: 'Trees', label: 'Земельные участки', type: 'land', gradient: 'from-lime-500 to-green-700' },
  { icon: 'Landmark', label: 'Отдельно стоящие здания', type: 'building', gradient: 'from-sky-500 to-blue-700' },
  { icon: 'Shuffle', label: 'Свободное назначение', type: 'free_purpose', gradient: 'from-cyan-500 to-teal-700' },
  { icon: 'Wrench', label: 'Автосервисы', type: 'car_service', gradient: 'from-zinc-500 to-slate-800' },
];

interface NewsPreview {
  id: number; title: string; slug: string; summary?: string;
  image_url?: string; published_at?: string; created_at: string;
}

export default function HomePage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare, onNavigate }: HomePageProps) {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  // Инициализируем из prefetch если уже готово — нулевого мигания не будет
  type Pf = { stats?: PublicStats; leadsCount?: number };
  const pf = (window as Window & { __PREFETCH__?: Pf }).__PREFETCH__;
  const [stats, setStats] = useState<PublicStats>(pf?.stats ?? { total: 0, main_city: 'Краснодар' });
  const [leadsCount, setLeadsCount] = useState(pf?.leadsCount ?? 0);

  const [aiOpen, setAiOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [latestNews, setLatestNews] = useState<NewsPreview[] | null>(null);
  const newsLimit = settings.home_news_limit ?? 10;
  const showNewsOnHome = settings.show_news_on_home;

  useEffect(() => {
    const cached = (window as Window & { __PREFETCH__?: Pf }).__PREFETCH__;
    const requests: Promise<void>[] = [];

    // stats + leadsCount — один запрос вместо двух
    if (!cached?.stats || !cached?.leadsCount) {
      requests.push(
        fetch(`${LISTINGS_URL}?resource=public_home_data`)
          .then(r => r.json())
          .then(d => {
            if (d.stats) setStats({ total: d.stats.total || 0, main_city: d.stats.main_city || 'Краснодар', by_category: d.stats.by_category || {}, by_deal: d.stats.by_deal || {} });
            if (typeof d.leads_count === 'number') setLeadsCount(d.leads_count);
          })
          .catch(() => undefined),
      );
    }

    // Новости — отдельный URL
    if (showNewsOnHome !== false) {
      requests.push(
        fetch(`${NEWS_URL}?action=list&limit=${newsLimit}`)
          .then(r => r.json())
          .then(d => setLatestNews(d.news || []))
          .catch(() => undefined),
      );
    }

    if (requests.length > 0) Promise.all(requests);
  }, []);

  // Реальное число объектов по категории — из API, с фолбэком на текущий пропс properties
  const categoryCount = (type: string): number => {
    const fromStats = stats.by_category?.[type];
    if (typeof fromStats === 'number') return fromStats;
    return properties.filter(p => String(p.type) === type).length;
  };

  const mainCity = settings.main_city || stats.main_city || 'Краснодар';
  const totalCount = stats.total || properties.length;

  // Новые объекты — берём в том порядке, в каком пришли с сервера.
  // Бэкенд уже сортирует по: last_edited_at, is_hot, is_new, updated_at, created_at, id.
  // Свою пересортировку НЕ делаем — иначе при подгрузке полного списка
  // топ-N меняется и пользователь видит «дерганье» объектов.
  const homeLimit = settings.home_listings_limit ?? 8;
  const newObjects = useMemo(
    () => properties.slice(0, homeLimit),
    [properties, homeLimit],
  );

  const showNews = settings.show_news_on_home !== false;
  const homeNewsLimit = settings.home_news_limit ?? 10;
  const showLeads = settings.show_leads_on_home !== false;

  // Preload LCP-изображения 2-4: первое уже preload-ится в App.tsx сразу после fetchListings.
  // Здесь добавляем следующие 3 — с низким приоритетом, чтобы браузер знал о них заранее.
  useEffect(() => {
    const lcpImgs = newObjects.slice(1, 4);
    const added: HTMLLinkElement[] = [];
    lcpImgs.forEach((p) => {
      const src = p.image;
      if (!src) return;
      if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      link.setAttribute('fetchpriority', 'low');
      document.head.appendChild(link);
      added.push(link);
    });
    return () => { added.forEach(l => l.remove()); };
  }, [newObjects]);

  const STATS_VIEW = [
    { value: totalCount > 0 ? `${totalCount}+` : '…', label: 'Объектов в базе', icon: 'Building2', deal: null },
    { value: leadsCount > 0 ? `${leadsCount}+` : '…', label: 'Заявок от клиентов', icon: 'MessageSquare', deal: null },
    { value: '98%', label: 'Успешных сделок', icon: 'TrendingUp', deal: null },
    { value: `с ${settings.company_since_year || 2007}`, label: 'На рынке', icon: 'Award', deal: null },
  ];

  const orgLdJson = useMemo(() => JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
    description: settings.seo_description || 'Коммерческая недвижимость и готовый бизнес в Краснодаре',
    foundingDate: String(settings.company_since_year || 2007),
    address: settings.company_address ? {
      '@type': 'PostalAddress',
      streetAddress: settings.company_address,
      addressLocality: settings.main_city || 'Краснодар',
      addressCountry: 'RU',
    } : undefined,
    telephone: settings.company_phone,
    email: settings.company_email,
    image: settings.logo_url,
    url: settings.site_url,
  }), [settings.company_name, settings.seo_description, settings.company_since_year, settings.company_address, settings.main_city, settings.company_phone, settings.company_email, settings.logo_url, settings.site_url]);

  // Первый объект с фото — используем как og:image главной страницы
  const lcpImage = newObjects.find(p => p.image)?.image;

  // Частые вопросы — данные берём из информации о компании.
  // Используются и в FAQPage Schema (для AI и поисковиков), и в видимом блоке.
  const cityName = mainCity || 'Краснодар';
  const sinceYear = settings.company_since_year || '2007';
  const faqItems = [
    {
      question: `Какую коммерческую недвижимость можно подобрать в ${cityName}е?`,
      answer: `В каталоге — офисы, торговые помещения, склады, помещения под общепит, производства, готовый бизнес и земельные участки в ${cityName}е и пригороде. Всего более ${totalCount} актуальных объектов.`,
    },
    {
      question: 'Сколько лет компания работает на рынке?',
      answer: `Агентство «Бизнес. Маркетинг. Недвижимость.» работает на рынке коммерческой недвижимости ${cityName}а с ${sinceYear} года.`,
    },
    {
      question: 'Как быстро подобрать подходящее помещение?',
      answer: 'Воспользуйтесь умным подбором с искусственным интеллектом — опишите задачу простыми словами, и система предложит подходящие объекты за 2 минуты.',
    },
    {
      question: 'Нужно ли платить комиссию за подбор объекта?',
      answer: 'Многие объекты сдаются и продаются напрямую от собственника — без комиссий и процентов. Условия по каждому объекту указаны в его карточке.',
    },
    {
      question: 'Можно ли арендовать и купить помещение?',
      answer: 'Да. В каталоге есть объекты как для аренды, так и для покупки — используйте фильтр по типу сделки.',
    },
    {
      question: 'Как связаться с агентством и оставить заявку?',
      answer: `Оставьте заявку прямо на сайте или позвоните нам — специалист подберёт объект под ваши задачи и ответит на вопросы по любому помещению в ${cityName}е.`,
    },
  ];

  return (
    <div>
      {lcpImage && <SeoHead ogImage={lcpImage} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: orgLdJson }}
      />

      {/* Hero — компактный */}
      <section className="hero-bg text-white py-10 md:py-14">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <h1 className="font-display font-900 text-2xl sm:text-3xl md:text-4xl leading-tight mb-3" elementtiming="lcp-heading">
              Коммерческая недвижимость и готовый бизнес в Краснодаре
            </h1>
            <p className="text-white/75 text-sm sm:text-base mb-5 animate-fade-in-up stagger-2 max-w-xl">
              Более {totalCount} объектов в {mainCity}е и пригороде. Подбор с ИИ за 2 минуты.
            </p>

            {/* AI search bar */}
            <h2 className="sr-only">Подбор помещения с ИИ за 2 минуты</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                setAiOpen(true);
              }}
              className="flex flex-col sm:flex-row gap-2 animate-fade-in-up stagger-3"
            >
              <div className="w-full sm:flex-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-3 sm:py-2 backdrop-blur-sm focus-within:border-white/60 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Icon name="Sparkles" size={14} className="text-white" />
                </div>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Опишите объект: «офис до 100м² в центре»…"
                  aria-label="Умный поиск объекта"
                  className="bg-transparent text-white placeholder:text-white/55 outline-none w-full text-base sm:text-sm min-w-0"
                />
              </div>
              <button
                type="submit"
                aria-label="Найти с ИИ"
                className="btn-orange text-white w-full sm:w-auto px-3 sm:px-5 py-3 sm:py-2.5 rounded-xl font-semibold font-display text-base sm:text-sm flex-shrink-0 inline-flex items-center justify-center gap-1.5 min-h-[48px] sm:min-h-[44px]"
              >
                <Icon name="Search" size={16} />
                Найти
              </button>
            </form>
            <div className="text-[11px] text-white/55 mt-1.5 animate-fade-in-up stagger-3">
              Умный поиск понимает обычный язык — площадь, район, тип, назначение
            </div>
          </div>
        </div>
      </section>

      {/* Stats — компактная горизонтальная панель */}
      <section className="bg-white border-b border-border py-3">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS_VIEW.map((stat, i) => {
              const clickable = stat.deal !== null;
              const goCatalog = () => { navigate('/catalog'); };
              const inner = (
                <>
                  <div className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <Icon name={stat.icon} size={16} className="text-brand-blue" />
                  </div>
                  <div>
                    <h4 className="font-display font-800 text-lg text-brand-blue leading-none flex items-center gap-1">
                      {stat.value}
                      {clickable && <Icon name="ArrowRight" size={12} className="text-brand-blue/60" />}
                    </h4>
                    <h5 className="text-[11px] text-muted-foreground mt-0.5 font-normal">{stat.label}</h5>
                  </div>
                </>
              );
              const baseCls = `flex items-center gap-2.5 animate-fade-in-up stagger-${i + 1} text-left p-1.5`;
              if (clickable) {
                return (
                  <button key={stat.label} type="button" onClick={goCatalog}
                    className={`${baseCls} hover:bg-muted/40 rounded-lg transition-colors cursor-pointer`}>
                    {inner}
                  </button>
                );
              }
              return (
                <div key={stat.label} className={baseCls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Categories — скрыты */}
      <section className="py-6 bg-background hidden">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.type}
                onClick={() => navigate(`/catalog/${cat.type}`)}
                className={`group relative flex flex-col items-center gap-2 p-3 bg-white rounded-xl border border-border hover:border-transparent hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 animate-fade-in-up stagger-${i + 1} overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-all duration-300`}>
                  <Icon name={cat.icon} size={20} className="text-white" />
                </div>
                <div className="text-center relative">
                  <div className="font-display font-700 text-xs text-foreground group-hover:text-white transition-colors leading-tight">{cat.label}</div>
                  <div className="text-[10px] text-muted-foreground group-hover:text-white/80 mt-0.5 transition-colors">
                    {categoryCount(cat.type)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Новые объекты */}
      <section className="py-6 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Icon name="Building2" size={16} className="text-brand-blue" />
              <h2 className="font-display font-700 text-base text-foreground">Аренда и продажа коммерческой недвижимости в Краснодаре</h2>
            </div>
            <button
              onClick={() => onNavigate('catalog')}
              aria-label="Смотреть все объекты каталога"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
            >
              Смотреть все объекты <Icon name="ArrowRight" size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {newObjects.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                isFavorite={favorites.includes(property.id)}
                isCompare={compareList.includes(property.id)}
                onToggleFavorite={onToggleFavorite}
                onToggleCompare={onToggleCompare}
                index={i}
              />
            ))}
            {newObjects.length < homeLimit && Array.from({ length: homeLimit - newObjects.length }).map((_, i) => (
              <div key={`sk-${i}`} className="rounded-xl overflow-hidden border border-border bg-white">
                <div className="aspect-[4/3] bg-muted" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — Разместить объект */}
      <section className="py-8 bg-gradient-to-r from-brand-blue to-indigo-700">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-white text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <Icon name="Home" size={20} className="opacity-80" />
                <span className="font-bold text-lg">Вы собственник?</span>
              </div>
              <p className="text-white/75 text-sm">
                Разместите объект бесплатно — заявка на модерацию и публикация в течение 24 часов
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex flex-col gap-1 text-white/70 text-xs text-right">
                <div className="flex items-center gap-1.5"><Icon name="Check" size={12} /> Бесплатно</div>
                <div className="flex items-center gap-1.5"><Icon name="Check" size={12} /> Без регистрации</div>
                <div className="flex items-center gap-1.5"><Icon name="Check" size={12} /> Быстро — 3 шага</div>
              </div>
              <button
                onClick={() => setOwnerOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-blue font-bold text-sm rounded-xl hover:bg-white/90 transition shadow-lg"
              >
                <Icon name="PlusCircle" size={18} />
                Разместить объект
              </button>
            </div>
          </div>
        </div>
      </section>

      {showLeads && (
        <Suspense fallback={<div className="py-8 bg-muted/20 border-t border-border" style={{minHeight: 200}} />}>
          <ClientLeadsSection limit={settings.home_leads_limit ?? 6} />
        </Suspense>
      )}

      {/* Блок новостей — 5 в ряд, 2 строки */}
      {showNews && (latestNews === null || latestNews.length > 0) && (
        <section className="py-6 bg-muted/30 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Icon name="Newspaper" size={16} className="text-brand-blue" />
                <h2 className="font-display font-700 text-base text-foreground">Новости коммерческой недвижимости Краснодара</h2>
              </div>
              <button
                onClick={() => navigate('/news')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 sm:justify-start px-4 py-2.5 sm:px-0 sm:py-0 rounded-xl sm:rounded-none border border-brand-blue/30 sm:border-0 bg-brand-blue/5 sm:bg-transparent text-brand-blue font-semibold text-sm sm:hover:gap-3 transition-all duration-200 shrink-0"
              >
                Смотреть все новости <Icon name="ArrowRight" size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {latestNews === null
                ? Array.from({ length: Math.min(homeNewsLimit, 5) }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl overflow-hidden border border-border">
                    <div className="p-3 space-y-2">
                      <div className="h-2.5 bg-muted rounded w-1/3" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-3/4" />
                    </div>
                  </div>
                ))
                : latestNews.slice(0, homeNewsLimit).map(n => (
                  <article
                    key={n.id}
                    onClick={() => navigate(`/news/${n.slug}`)}
                    className="group cursor-pointer bg-white rounded-xl overflow-hidden border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className="p-3 flex flex-col gap-1.5 h-full">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Icon name="Newspaper" size={12} className="text-brand-blue/50 shrink-0" />
                        {new Date(n.published_at || n.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                      </div>
                      <h3 className="font-medium text-xs leading-snug line-clamp-3 group-hover:text-brand-blue transition-colors">{n.title}</h3>
                    </div>
                  </article>
                ))
              }
            </div>
          </div>
        </section>
      )}

      {/* Частые вопросы — FAQ Schema + видимый блок (полезно для AI и поиска) */}
      <SchemaOrg id="faq" schema={makeFaqSchema(faqItems)} />
      <section className="py-4 bg-white" aria-labelledby="faq-title">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 id="faq-title" className="font-display font-800 text-lg sm:text-xl text-foreground mb-3 text-center">
            Частые вопросы
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-x-4 md:gap-y-2 md:items-start">
            {faqItems.map((f, i) => (
              <details key={i} className="group bg-muted/30 rounded-lg border border-border px-3 py-2">
                <summary className="flex items-center justify-between cursor-pointer list-none font-medium text-[13px] text-foreground">
                  {f.question}
                  <Icon name="ChevronDown" size={15} className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0 ml-2" />
                </summary>
                <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {aiOpen && (
        <Suspense fallback={null}>
          <AIMatchModal
            open={aiOpen}
            onClose={() => setAiOpen(false)}
            initialPrompt={searchQuery}
            autoSubmit={!!searchQuery.trim()}
          />
        </Suspense>
      )}

      {ownerOpen && (
        <Suspense fallback={null}>
          <OwnerSubmitModal onClose={() => setOwnerOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}