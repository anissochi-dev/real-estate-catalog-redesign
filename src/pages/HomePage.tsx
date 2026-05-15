import { useEffect, useState } from 'react';
import { Property, Page } from '@/App';
import PropertyCard from '@/components/PropertyCard';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import ClientLeadsSection from '@/components/ClientLeadsSection';

interface PublicStats { total: number; main_city: string }

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
  { icon: 'Building2', label: 'Офисы', count: 320, type: 'office', gradient: 'from-blue-500 to-indigo-600' },
  { icon: 'ShoppingBag', label: 'Торговля', count: 218, type: 'retail', gradient: 'from-orange-500 to-rose-500' },
  { icon: 'Warehouse', label: 'Склады', count: 145, type: 'warehouse', gradient: 'from-slate-500 to-zinc-700' },
  { icon: 'UtensilsCrossed', label: 'Рестораны', count: 89, type: 'restaurant', gradient: 'from-amber-500 to-red-500' },
  { icon: 'Briefcase', label: 'Готовый бизнес', count: 183, type: 'business', gradient: 'from-violet-500 to-purple-700' },
  { icon: 'Factory', label: 'Производство', count: 74, type: 'production', gradient: 'from-teal-500 to-emerald-700' },
];

export default function HomePage({ properties, favorites, compareList, onToggleFavorite, onToggleCompare, onNavigate }: HomePageProps) {
  const { settings } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<PublicStats>({ total: 0, main_city: 'Краснодар' });

  useEffect(() => {
    fetch(`${LISTINGS_URL}?resource=public_stats`)
      .then(r => r.json())
      .then(d => setStats({ total: d.total || 0, main_city: d.main_city || 'Краснодар' }))
      .catch(() => undefined);
  }, []);

  const mainCity = settings.main_city || stats.main_city || 'Краснодар';
  const totalCount = stats.total || properties.length;

  // Новые объекты — последние по дате
  const newObjects = [...properties].sort((a, b) => b.id - a.id).slice(0, 6);

  const STATS_VIEW = [
    { value: `${totalCount}+`, label: 'Объектов в базе', icon: 'Building2', deal: 'all' as const },
    { value: `${properties.filter(p => p.category === 'business').length}+`, label: 'Готовых бизнесов', icon: 'Briefcase', deal: 'business' as const },
    { value: '98%', label: 'Успешных сделок', icon: 'TrendingUp', deal: null },
    { value: 'с 2007', label: 'На рынке', icon: 'Award', deal: null },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="hero-bg text-white py-20 md:py-28">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm mb-6 animate-fade-in-up">
              <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
              <span>Интеллектуальный подбор с ИИ</span>
            </div>
            <h1 className="font-display font-900 text-4xl md:text-6xl leading-tight mb-5 animate-fade-in-up stagger-1">
              Коммерческая недвижимость и готовый бизнес
            </h1>
            <p className="text-white/75 text-lg md:text-xl mb-8 animate-fade-in-up stagger-2 max-w-xl">
              Более {totalCount} объектов в {mainCity}е и пригороде. Офисы, склады, торговые площади и работающий бизнес под ключ.
            </p>

            {/* Search bar */}
            <div className="flex gap-3 animate-fade-in-up stagger-3">
              <div className="flex-1 flex items-center gap-3 bg-white/10 border border-white/25 rounded-xl px-4 py-3 backdrop-blur-sm">
                <Icon name="Search" size={20} className="text-white/60 flex-shrink-0" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Район, улица, тип объекта..."
                  className="bg-transparent text-white placeholder:text-white/50 outline-none w-full text-base"
                />
              </div>
              <button
                onClick={() => onNavigate('catalog')}
                className="btn-orange text-white px-6 py-3 rounded-xl font-semibold font-display text-base flex-shrink-0"
              >
                Найти
              </button>
            </div>

            {/* Quick filters */}
            <div className="flex flex-wrap gap-2 mt-4 animate-fade-in-up stagger-4">
              {['Продажа', 'Аренда', 'Готовый бизнес', 'ЦАО', 'до 10 млн ₽'].map(tag => (
                <button
                  key={tag}
                  className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-white/80 hover:bg-white/20 transition-all duration-200"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b border-border py-6">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS_VIEW.map((stat, i) => {
              const clickable = stat.deal !== null;
              const Wrapper: 'button' | 'div' = clickable ? 'button' : 'div';
              return (
                <Wrapper
                  key={stat.label}
                  onClick={clickable ? () => onNavigate('catalog') : undefined}
                  className={`flex items-center gap-3 animate-fade-in-up stagger-${i + 1} text-left ${clickable ? 'hover:bg-muted/40 -m-2 p-2 rounded-xl transition-colors cursor-pointer' : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                    <Icon name={stat.icon} size={20} className="text-brand-blue" />
                  </div>
                  <div>
                    <div className="font-display font-800 text-2xl text-brand-blue leading-none flex items-center gap-1">
                      {stat.value}
                      {clickable && <Icon name="ArrowRight" size={14} className="text-brand-blue/60" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-end mb-8">
            <button
              onClick={() => onNavigate('catalog')}
              className="hidden md:flex items-center gap-2 text-brand-blue font-semibold text-sm hover:gap-3 transition-all duration-200"
            >
              Все объекты <Icon name="ArrowRight" size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat.type}
                onClick={() => onNavigate('catalog')}
                className={`group relative flex flex-col items-center gap-3 p-5 bg-white rounded-2xl border border-border hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-in-up stagger-${i + 1} overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${cat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className={`relative w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-300`}>
                  <Icon name={cat.icon} size={26} className="text-white" />
                </div>
                <div className="text-center relative">
                  <div className="font-display font-700 text-sm text-foreground group-hover:text-white transition-colors">{cat.label}</div>
                  <div className="text-xs text-muted-foreground group-hover:text-white/80 mt-0.5 transition-colors">{cat.count} объектов</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Новые объекты */}
      <section className="py-12 bg-muted/40">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-end mb-8">
            <button
              onClick={() => onNavigate('catalog')}
              className="hidden md:flex items-center gap-2 text-brand-blue font-semibold text-sm hover:gap-3 transition-all duration-200"
            >
              Смотреть все <Icon name="ArrowRight" size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {newObjects.map((property, i) => (
              <PropertyCard
                key={property.id}
                property={property}
                isFavorite={favorites.includes(property.id)}
                isCompare={compareList.includes(property.id)}
                onToggleFavorite={onToggleFavorite}
                onToggleCompare={onToggleCompare}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>

          <div className="mt-8 text-center md:hidden">
            <button
              onClick={() => onNavigate('catalog')}
              className="btn-blue text-white px-8 py-3 rounded-xl font-semibold font-display"
            >
              Смотреть все объекты
            </button>
          </div>
        </div>
      </section>

      <ClientLeadsSection />

      {/* AI Banner */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="bg-gradient-to-r from-brand-blue to-blue-700 rounded-3xl p-8 md:p-12 relative overflow-hidden">
            <div className="absolute right-0 top-0 w-64 h-64 opacity-10">
              <div className="w-full h-full rounded-full bg-white blur-3xl" />
            </div>
            <div className="relative z-10 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white/90 text-sm mb-4">
                <Icon name="Sparkles" size={14} />
                ИИ-помощник
              </div>
              <h2 className="font-display font-800 text-2xl md:text-4xl text-white mb-4">
                Подберём объект за 2 минуты
              </h2>
              <p className="text-white/75 text-base mb-6">
                Опишите задачу — ИИ найдёт подходящие варианты, рассчитает окупаемость и подготовит аналитику по рынку.
              </p>
              <button className="btn-orange text-white px-6 py-3 rounded-xl font-semibold font-display text-base inline-flex items-center gap-2">
                <Icon name="Sparkles" size={18} />
                Спросить ИИ
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-white/70 py-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div>
              <div className="font-display font-800 text-xl text-white mb-1">BIZNEST</div>
              <div className="text-sm">Коммерческая недвижимость и готовый бизнес</div>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <div className="text-white font-semibold mb-3">Каталог</div>
                <ul className="space-y-2">
                  {['Офисы', 'Торговля', 'Склады', 'Рестораны'].map(i => (
                    <li key={i}><button className="hover:text-white transition-colors">{i}</button></li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-white font-semibold mb-3">Компания</div>
                <ul className="space-y-2">
                  {['О нас', 'Контакты', 'Оценка бизнеса', 'Партнёрам'].map(i => (
                    <li key={i}><button className="hover:text-white transition-colors">{i}</button></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-6 text-sm">
            © 2024 BIZNEST. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  );
}