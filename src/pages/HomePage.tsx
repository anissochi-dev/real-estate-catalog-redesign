import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Property, Page } from '@/App';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import { NEWS_URL } from '@/lib/adminApi';
import SeoHead from '@/components/SeoHead';
import SchemaOrg, { makeFaqSchema } from '@/components/SchemaOrg';
import { CATALOG_CATEGORIES, catalogCategoryUrl } from '@/lib/categories';
import HomeHero from './home/HomeHero';
import HomeStatsBar from './home/HomeStatsBar';
import HomeNewListings from './home/HomeNewListings';
import HomeNewsSection, { NewsPreview } from './home/HomeNewsSection';
import HomeFaqSection from './home/HomeFaqSection';

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

const CATEGORIES = CATALOG_CATEGORIES;

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

  // Загружаем статистику — только если prefetch не принёс данные
  useEffect(() => {
    const cached = (window as Window & { __PREFETCH__?: Pf }).__PREFETCH__;
    if (cached?.stats && cached?.leadsCount) return;
    fetch(`${LISTINGS_URL}?resource=public_home_data`)
      .then(r => r.json())
      .then(d => {
        if (d.stats) setStats({ total: d.stats.total || 0, main_city: d.stats.main_city || 'Краснодар', by_category: d.stats.by_category || {}, by_deal: d.stats.by_deal || {} });
        if (typeof d.leads_count === 'number') setLeadsCount(d.leads_count);
      })
      .catch(() => undefined);
  }, []);

  // Новости — некритичны для первого экрана, грузим в простое браузера
  useEffect(() => {
    if (showNewsOnHome === false) return;
    const load = () => {
      fetch(`${NEWS_URL}?action=list&limit=${newsLimit}`)
        .then(r => r.json())
        .then(d => setLatestNews(d.news || []))
        .catch(() => undefined);
    };
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(load, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(load, 500);
    return () => clearTimeout(t);
  }, [showNewsOnHome, newsLimit]);

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
      answer: `В каталоге — офисы, торговые помещения, склады, помещения под общепит, производства, готовый бизнес и земельные участки в ${cityName}е. Всего более ${totalCount} актуальных объектов.`,
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
      <HomeHero
        totalCount={totalCount}
        mainCity={mainCity}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setAiOpen={setAiOpen}
      />

      {/* Stats — компактная горизонтальная панель */}
      <HomeStatsBar statsView={STATS_VIEW} onGoCatalog={() => navigate('/catalog')} />

      {/* Categories — скрыты */}
      <section className="py-6 bg-background hidden">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-3">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.type}
                onClick={() => navigate(catalogCategoryUrl(cat.type))}
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
      <HomeNewListings
        newObjects={newObjects}
        homeLimit={homeLimit}
        favorites={favorites}
        compareList={compareList}
        onToggleFavorite={onToggleFavorite}
        onToggleCompare={onToggleCompare}
        onSeeAll={() => onNavigate('catalog')}
      />

      {showLeads && (
        <Suspense fallback={<div className="py-8 bg-muted/20 border-t border-border" style={{minHeight: 200}} />}>
          <ClientLeadsSection limit={settings.home_leads_limit ?? 6} />
        </Suspense>
      )}

      {/* Блок новостей — 5 в ряд, 2 строки */}
      {showNews && (latestNews === null || latestNews.length > 0) && (
        <HomeNewsSection
          latestNews={latestNews}
          homeNewsLimit={homeNewsLimit}
          onOpenNews={() => navigate('/news')}
          onOpenArticle={(slug) => navigate(`/news/${slug}`)}
        />
      )}

      {/* Частые вопросы — FAQ Schema + видимый блок (полезно для AI и поиска) */}
      <SchemaOrg id="faq" schema={makeFaqSchema(faqItems)} />
      <HomeFaqSection faqItems={faqItems} />

      {/* SEO-текст главной страницы */}
      {settings.home_seo_text && (
        <section className="py-8 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <div
              className="prose prose-sm max-w-none text-muted-foreground text-[13px] leading-relaxed [&_h2]:font-display [&_h2]:font-700 [&_h2]:text-base [&_h2]:text-foreground [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-sm [&_h3]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-foreground [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: settings.home_seo_text }}
            />
          </div>
        </section>
      )}

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