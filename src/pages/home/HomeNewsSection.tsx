import Icon from '@/components/ui/icon';

interface NewsPreview {
  id: number; title: string; slug: string; summary?: string;
  image_url?: string; published_at?: string; created_at: string;
}

interface HomeNewsSectionProps {
  latestNews: NewsPreview[] | null;
  homeNewsLimit: number;
  onOpenNews: () => void;
  onOpenArticle: (slug: string) => void;
}

export default function HomeNewsSection({ latestNews, homeNewsLimit, onOpenNews, onOpenArticle }: HomeNewsSectionProps) {
  return (
    <section className="py-6 bg-muted/30 border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="Newspaper" size={16} className="text-brand-blue" />
            <h2 className="font-display font-700 text-base text-foreground">Новости коммерческой недвижимости Краснодара</h2>
          </div>
          <button
            onClick={onOpenNews}
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
                onClick={() => onOpenArticle(n.slug)}
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
  );
}

export type { NewsPreview };
