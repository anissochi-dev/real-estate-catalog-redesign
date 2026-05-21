import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';

interface NewsItem {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  image_url?: string;
  source_name?: string;
  category?: string;
  published_at?: string;
  created_at: string;
  content?: string;
}

function fmtDate(s?: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NewsListPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 12;

  useEffect(() => {
    setLoading(true);
    fetch(`${NEWS_URL}?action=list&page=${page}&limit=${LIMIT}`)
      .then(r => r.json())
      .then(d => { setNews(d.news || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    document.title = `Новости коммерческой недвижимости | ${settings.company_name || 'BIZNEST'}`;
  }, [settings.company_name]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display font-800 text-3xl text-foreground mb-2">Новости коммерческой недвижимости</h1>
        <p className="text-muted-foreground">Актуальные новости рынка, аналитика и обзоры Краснодара и Краснодарского края</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-border animate-pulse">
              <div className="h-44 bg-muted" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-20">
          <Icon name="Newspaper" size={48} className="mx-auto mb-4 text-muted-foreground/40" />
          <div className="text-xl font-semibold text-muted-foreground">Новостей пока нет</div>
          <div className="text-sm text-muted-foreground mt-1">Возвращайтесь позже</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map(n => (
              <article
                key={n.id}
                onClick={() => navigate(`/news/${n.slug}`)}
                className="bg-white rounded-2xl overflow-hidden border border-border hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer group"
              >
                <div className="relative h-44 bg-gradient-to-br from-brand-blue/10 to-brand-blue/20 overflow-hidden">
                  {n.image_url ? (
                    <img src={n.image_url} alt={n.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon name="Newspaper" size={40} className="text-brand-blue/30" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-brand-blue text-white font-semibold">
                      Аналитика
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <h2 className="font-display font-700 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-brand-blue transition-colors">
                    {n.title}
                  </h2>
                  {n.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{n.summary}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fmtDate(n.published_at || n.created_at)}</span>
                    {n.source_name && <span className="truncate ml-2 max-w-[100px]">{n.source_name}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {total > LIMIT && (
            <div className="flex justify-center gap-2 mt-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted disabled:opacity-40 transition text-sm"
              >
                <Icon name="ChevronLeft" size={16} />
              </button>
              <span className="px-4 py-2 text-sm font-medium">
                {page} / {Math.ceil(total / LIMIT)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / LIMIT)}
                className="px-4 py-2 rounded-xl border border-border hover:bg-muted disabled:opacity-40 transition text-sm"
              >
                <Icon name="ChevronRight" size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [article, setArticle] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${NEWS_URL}?action=get&slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => setArticle(d.article || null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!article) return;
    document.title = `${article.title} | ${settings.company_name || 'BIZNEST'}`;
    const desc = article.summary || (article.content || '').slice(0, 160);
    const setMeta = (sel: string, create: () => HTMLMetaElement, content: string) => {
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) { el = create(); document.head.appendChild(el); }
      el.content = content;
    };
    setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), desc);
    setMeta('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, article.title);
    setMeta('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, desc);
    if (article.image_url) {
      setMeta('meta[property="og:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); return m; }, article.image_url!);
    }
  }, [article, settings.company_name]);

  if (loading) return (
    <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Загрузка...</div>
  );

  if (!article) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <div className="text-5xl mb-4">📰</div>
      <div className="font-display font-700 text-xl mb-2">Статья не найдена</div>
      <button onClick={() => navigate('/news')} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold mt-4">
        К списку новостей
      </button>
    </div>
  );

  const paragraphs = (article.content || '').split('\n').filter(Boolean);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <button
        onClick={() => navigate('/news')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-blue transition mb-6"
      >
        <Icon name="ArrowLeft" size={16} />
        Все новости
      </button>

      <article>
        <div className="mb-6">
          <span className="text-xs px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue font-semibold">
            Аналитика
          </span>
        </div>

        <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground mb-4 leading-tight">
          {article.title}
        </h1>

        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-6">
          <span>{fmtDate(article.published_at || article.created_at)}</span>
          {article.source_name && (
            <>
              <span>·</span>
              <span>{article.source_name}</span>
            </>
          )}
        </div>

        {article.image_url && (
          <div className="rounded-2xl overflow-hidden mb-8">
            <img src={article.image_url} alt={article.title} className="w-full max-h-80 object-cover" />
          </div>
        )}

        {article.summary && (
          <div className="text-base font-medium text-foreground mb-6 pb-6 border-b border-border leading-relaxed">
            {article.summary}
          </div>
        )}

        <div className="prose prose-sm max-w-none space-y-4">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-foreground leading-relaxed">{p}</p>
          ))}
        </div>

        {article.source_url && (
          <div className="mt-8 pt-6 border-t border-border">
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-brand-blue hover:underline"
            >
              <Icon name="ExternalLink" size={14} />
              Источник материала
            </a>
          </div>
        )}
      </article>
    </div>
  );
}