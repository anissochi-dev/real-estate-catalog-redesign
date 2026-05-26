import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Property, Page } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import ClientLeadsSection from '@/components/ClientLeadsSection';
import AIMatchModal from '@/components/AIMatchModal';
import { NEWS_URL } from '@/lib/adminApi';
import SeoHead from '@/components/SeoHead';

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
  const [stats, setStats] = useState<PublicStats>({ total: 0, main_city: 'Краснодар' });
  const [leadsCount, setLeadsCount] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [latestNews, setLatestNews] = useState<NewsPreview[]>([]);

  const newsLimit = settings.home_news_limit ?? 10;
  const showNewsOnHome = settings.show_news_on_home;

  useEffect(() => {
    const requests: Promise<void>[] = [];

    // Статистика + счётчик заявок — всегда
    requests.push(
      fetch(`${LISTINGS_URL}?resource=public_stats`)
        .then(r => r.json())
        .then(d => setStats({
          total: d.total || 0,
          main_city: d.main_city || 'Краснодар',
          by_category: d.by_category || {},
          by_deal: d.by_deal || {},
        }))
        .catch(() => undefined),
    );
    requests.push(
      fetch(`${LISTINGS_URL}?resource=public_leads_full&limit=1`)
        .then(r => r.json())
        .then(d => setLeadsCount(d.total || 0))
        .catch(() => undefined),
    );

    // Новости — только если включены
    if (showNewsOnHome !== false) {
      requests.push(
        fetch(`${NEWS_URL}?action=list&limit=${newsLimit}`)
          .then(r => r.json())
          .then(d => setLatestNews(d.news || []))
          .catch(() => undefined),
      );
    }

    Promise.all(requests);
  }, [newsLimit, showNewsOnHome]);

  // Реальное число объектов по категории — из API, с фолбэком на текущий пропс properties
  const categoryCount = (type: string): number => {
    const fromStats = stats.by_category?.[type];
    if (typeof fromStats === 'number') return fromStats;
    return properties.filter(p => String(p.type) === type).length;
  };

  const mainCity = settings.main_city || stats.main_city || 'Краснодар';
  const totalCount = stats.total || properties.length;

  // Новые объекты — приоритет: недавно отредактированные > обновлённые > новые по id
  const propTime = (p: Property): number => {
    const src = p.lastEditedAt || p.updatedAt || p.createdAt;
    if (src) {
      const t = new Date(src).getTime();
      if (Number.isFinite(t)) return t;
    }
    return p.id;
  };
  const homeLimit = settings.home_listings_limit ?? 20;
  const newObjects = useMemo(
    () => [...properties].sort((a, b) => propTime(b) - propTime(a)).slice(0, homeLimit),
    [properties, homeLimit],
  );

  const showNews = settings.show_news_on_home !== false;
  const homeNewsLimit = settings.home_news_limit ?? 10;
  const showLeads = settings.show_leads_on_home !== false;

  // Preload LCP-изображения: первые 4 карточки — браузер начинает качать сразу,
  // не дожидаясь парсинга JS и рендера компонентов.
  useEffect(() => {
    const lcpImgs = newObjects.slice(0, 4);
    const added: HTMLLinkElement[] = [];
    lcpImgs.forEach((p, i) => {
      const src = p.image;
      if (!src) return;
      if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      link.fetchPriority = i === 0 ? 'high' : 'low';
      document.head.appendChild(link);
      added.push(link);
    });
    return () => { added.forEach(l => l.remove()); };
  }, [newObjects]);

  const STATS_VIEW = [
    { value: `${totalCount}+`, label: 'Объектов в базе', icon: 'Building2', deal: null },
    { value: leadsCount > 0 ? `${leadsCount}+` : '...', label: 'Заявок от клиентов', icon: 'MessageSquare', deal: null },
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
            <h1 className="font-display font-900 text-2xl sm:text-3xl md:text-4xl leading-tight mb-3 animate-fade-in-up stagger-1">
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
              className="flex gap-2 animate-fade-in-up stagger-3"
            >
              <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-2 backdrop-blur-sm focus-within:border-white/60 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
                  <Icon name="Sparkles" size={14} className="text-white" />
                </div>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Опишите объект…"
                  aria-label="ИИ-поиск объекта"
                  className="bg-transparent text-white placeholder:text-white/55 outline-none w-full text-sm min-w-0"
                />
              </div>
              <button
                type="submit"
                aria-label="Найти с ИИ"
                className="btn-orange text-white px-3 sm:px-5 py-2.5 rounded-xl font-semibold font-display text-sm flex-shrink-0 inline-flex items-center gap-1.5 min-h-[44px]"
              >
                <Icon name="Sparkles" size={14} />
                Найти с ИИ
              </button>
            </form>
            <div className="text-[11px] text-white/55 mt-1.5 animate-fade-in-up stagger-3">
              Опишите задачу обычным языком — ИИ подберёт подходящие объекты
            </div>

            {/* Quick filters */}
            <div className="flex flex-wrap gap-1.5 mt-3 animate-fade-in-up stagger-4">
              {[
                ['Продажа', '/catalog?deal=sale'],
                ['Аренда', '/catalog?deal=rent'],
              ].map(([label, to]) => (
                <button
                  key={label}
                  onClick={() => navigate(to)}
                  className="px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs text-white/85 hover:bg-white/20 transition-all duration-200"
                >
                  {label}
                </button>
              ))}
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
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
        </div>
      </section>

      {showLeads && <ClientLeadsSection limit={settings.home_leads_limit ?? 6} />}

      {/* Блок новостей — 5 в ряд, 2 строки */}
      {showNews && latestNews.length > 0 && (
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
              {latestNews.slice(0, homeNewsLimit).map(n => (
                <article
                  key={n.id}
                  onClick={() => navigate(`/news/${n.slug}`)}
                  className="group cursor-pointer bg-white rounded-xl overflow-hidden border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="h-24 relative overflow-hidden bg-gradient-to-br from-brand-blue/10 to-brand-blue/20">
                    {n.image_url ? (
                      <img src={n.image_url} alt={n.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : settings.logo_url ? (
                      <div className="w-full h-full flex items-center justify-center bg-brand-blue/5">
                        <img src={settings.logo_url} alt="лого" loading="lazy" className="w-10 h-10 object-contain opacity-40" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="Newspaper" size={20} className="text-brand-blue/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h3 className="font-medium text-xs leading-snug line-clamp-2 group-hover:text-brand-blue transition-colors">{n.title}</h3>
                    <h6 className="text-[10px] text-muted-foreground mt-1.5 font-normal">
                      {new Date(n.published_at || n.created_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                    </h6>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <AIMatchModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        initialPrompt={searchQuery}
        autoSubmit={!!searchQuery.trim()}
      />
    </div>
  );
}