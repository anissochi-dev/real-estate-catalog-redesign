import Icon from '@/components/ui/icon';

interface CatalogHeroProps {
  aiQuery: string;
  onAiQueryChange: (v: string) => void;
  onAiSubmit: () => void;
}

export default function CatalogHero({ aiQuery, onAiQueryChange, onAiSubmit }: CatalogHeroProps) {
  return (
    <div className="hero-bg text-white">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <form
          onSubmit={e => { e.preventDefault(); if (aiQuery.trim()) onAiSubmit(); }}
          className="flex gap-2 max-w-2xl"
        >
          <div className="flex-1 flex items-center gap-2 bg-white/10 border border-white/25 rounded-xl px-3 py-2.5 backdrop-blur-sm focus-within:border-white/60 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-orange to-rose-500 flex items-center justify-center flex-shrink-0">
              <Icon name="Sparkles" size={14} className="text-white" />
            </div>
            <input
              value={aiQuery}
              onChange={e => onAiQueryChange(e.target.value)}
              placeholder="Опишите нужный объект — ИИ подберёт варианты…"
              aria-label="ИИ-поиск объекта"
              className="bg-transparent text-white placeholder:text-white/55 outline-none w-full text-sm min-w-0"
            />
            {aiQuery && (
              <button type="button" onClick={() => onAiQueryChange('')} className="text-white/50 hover:text-white/80 flex-shrink-0">
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
        <p className="text-[11px] text-white/50 mt-1.5">Опишите задачу обычным языком — ИИ подберёт подходящие объекты</p>
      </div>
    </div>
  );
}
