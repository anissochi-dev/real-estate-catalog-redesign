import Icon from '@/components/ui/icon';

interface HomeHeroProps {
  totalCount: number;
  mainCity: string;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  setAiOpen: (v: boolean) => void;
}

export default function HomeHero({ totalCount, mainCity, searchQuery, setSearchQuery, setAiOpen }: HomeHeroProps) {
  return (
    <section className="hero-bg text-white py-10 md:py-14">
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl">
          <h1 className="font-display font-900 text-2xl sm:text-3xl md:text-4xl leading-tight mb-3" elementtiming="lcp-heading">
            Коммерческая недвижимость и готовый бизнес в Краснодаре
          </h1>
          <p className="text-white/75 text-sm sm:text-base mb-5 animate-fade-in-up stagger-2 max-w-xl">
            Более {totalCount} объектов в {mainCity}е. Подбор с ИИ за 2 минуты.
          </p>

          {/* AI search bar */}
          <h2 className="sr-only">Умный подбор коммерческой недвижимости в Краснодаре</h2>
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
  );
}
