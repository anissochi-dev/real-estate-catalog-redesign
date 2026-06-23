import Breadcrumbs from '@/components/Breadcrumbs';
import Icon from '@/components/ui/icon';
import { catalogCategoryUrl } from '@/lib/categories';
import { CategoryMetaItem } from './categoryMeta';

interface CategoryHeroProps {
  meta: CategoryMetaItem;
  type?: string;
  aiQuery: string;
  setAiQuery: (v: string) => void;
  setAiOpen: (v: boolean) => void;
}

export default function CategoryHero({ meta, type, aiQuery, setAiQuery, setAiOpen }: CategoryHeroProps) {
  return (
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
  );
}
