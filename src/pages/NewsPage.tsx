import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { useSettings } from '@/contexts/SettingsContext';
import SchemaOrg, { makeNewsArticleSchema, makeItemListSchema, makeBreadcrumbSchema } from '@/components/SchemaOrg';
import { getSiteUrl } from '@/lib/siteUrl';
import SeoHead, { useSeoH1 } from '@/components/SeoHead';

interface NewsItem {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  image_url?: string;
  source_name?: string;
  category?: string;
  published_at?: string;
  updated_at?: string;
  created_at: string;
  content?: string;
  seo_h1?: string | null;
  seo_h2?: string | null;
  seo_h3?: string | null;
  seo_h4?: string | null;
  seo_h5?: string | null;
}

function fmtDate(s?: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NewsListPage() {
  const { settings } = useSettings();
  const h1 = useSeoH1('Новости рынка недвижимости');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = settings.news_list_limit ?? 12;

  useEffect(() => {
    setLoading(true);
    fetch(`${NEWS_URL}?action=list&page=${page}&limit=${LIMIT}`)
      .then(r => r.json())
      .then(d => { setNews(d.news || []); setTotal(d.total || 0); })
      .finally(() => setLoading(false));
  }, [page]);

  const siteUrl = getSiteUrl(settings.site_url);

  const newsListSchema = news.length > 0
    ? makeItemListSchema(
        news.map(n => ({
          name: n.title,
          url: `${siteUrl}/news/${n.slug}`,
          image: n.image_url || undefined,
          description: n.summary || undefined,
        })),
        'Новости коммерческой недвижимости',
      )
    : null;

  const newsBcSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: siteUrl },
    { name: 'Новости', url: `${siteUrl}/news` },
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <SeoHead path="/news" h1={h1} />
      {newsListSchema && <SchemaOrg schema={newsListSchema} id="news-list" />}
      <SchemaOrg schema={newsBcSchema} id="news-list-bc" />
      <div className="mb-8">
        <h1 className="font-display font-800 text-3xl text-foreground mb-1">{h1}</h1>
        <h2 className="font-display font-600 text-lg text-brand-blue mb-2">Аналитика и обзоры рынка Краснодара и Краснодарского края</h2>
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
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none p-0 m-0">
            {news.filter(n => !!n.slug).map(n => (
              <li key={n.id}>
              <article
                className="bg-white rounded-2xl overflow-hidden border border-border hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group h-full"
              >
                <Link to={`/news/${n.slug}`} className="block">
                  <div className="relative h-44 bg-gradient-to-br from-brand-blue/10 to-brand-blue/20 overflow-hidden">
                    {n.image_url ? (
                      <img src={n.image_url} alt={n.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
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
                </Link>
              </article>
              </li>
            ))}
          </ul>

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

  const articleTitle = article ? article.title : undefined;
  const articleDesc = article ? (article.summary || article.content || '').slice(0, 160) : undefined;
  const articleImage = article?.image_url || undefined;

  if (loading) return (
    <div className="container mx-auto px-4 py-20 text-center text-muted-foreground">Загрузка...</div>
  );

  if (!article) return (
    <div className="container mx-auto px-4 py-20 text-center">
      <SeoHead title="Статья не найдена" noindex />
      <div className="text-5xl mb-4">📰</div>
      <div className="font-display font-700 text-xl mb-2">Статья не найдена</div>
      <button onClick={() => navigate('/news')} className="btn-blue text-white px-6 py-2.5 rounded-xl text-sm font-semibold mt-4">
        К списку новостей
      </button>
    </div>
  );

  const paragraphs = (article.content || '').split('\n').filter(Boolean);

  // Ограничения длины заголовков по SEO: H1 ≤ 70, H2 ≤ 60, H3–H6 ≤ 50
  const clip = (s: string, max: number) => (s && s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
  const h1 = clip(article.seo_h1 || article.title, 70);
  const h2text = article.seo_h2 ? clip(article.seo_h2, 60) : (article.summary || null);
  const h3text = article.seo_h3 ? clip(article.seo_h3, 50) : null;
  const h4text = article.seo_h4 ? clip(article.seo_h4, 50) : null;
  const h5text = article.seo_h5 ? clip(article.seo_h5, 50) : null;

  const articleSiteUrl = settings.site_url || 'https://bmn.su';
  const articlePageUrl = `${articleSiteUrl}/news/${article.slug}`;

  const articleSchema = makeNewsArticleSchema({
    title: article.title,
    description: article.summary || (article.content || '').slice(0, 160),
    url: articlePageUrl,
    image: article.image_url || undefined,
    publishedAt: article.published_at || article.created_at,
    authorName: article.source_name || undefined,
    publisherName: settings.company_name || 'Бизнес. Маркетинг. Недвижимость.',
    publisherLogo: settings.logo_url || undefined,
  });

  const articleBcSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: articleSiteUrl },
    { name: 'Новости', url: `${articleSiteUrl}/news` },
    { name: article.title, url: articlePageUrl },
  ]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <SeoHead title={articleTitle} description={articleDesc} h1={h1} ogImage={articleImage} />
      <SchemaOrg schema={articleSchema} id={`article-${article.id}`} />
      <SchemaOrg schema={articleBcSchema} id={`article-bc-${article.id}`} />
      <button
        onClick={() => navigate('/news')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-blue transition mb-6"
      >
        <Icon name="ArrowLeft" size={16} />
        Все новости
      </button>

      <article>
        {h5text && (
          <div className="mb-4">
            <h5 className="text-xs text-muted-foreground font-normal">{h5text}</h5>
          </div>
        )}

        <h1 className="font-display font-800 text-2xl md:text-3xl text-foreground mb-4 leading-tight">
          {h1}
        </h1>

        {h3text && (
          <h3 className="font-display font-600 text-base text-brand-blue mb-3 leading-snug">{h3text}</h3>
        )}

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
            <img src={article.image_url} alt={h1} className="w-full max-h-80 object-cover" />
          </div>
        )}

        {h2text && (
          <h2 className="text-base font-medium text-foreground mb-6 pb-6 border-b border-border leading-relaxed">
            {h2text}
          </h2>
        )}

        {h4text && (
          <h4 className="text-sm font-semibold text-muted-foreground mb-4">{h4text}</h4>
        )}

        <div className="prose prose-sm max-w-none space-y-4">
          {paragraphs.map((p, i) => {
            if (i === 0) return <p key={i} className="text-foreground leading-relaxed font-medium">{p}</p>;
            if (p.length < 80 && !p.endsWith('.') && !p.endsWith('…')) {
              return <h3 key={i} className="font-display font-700 text-base text-foreground mt-6 mb-1">{p}</h3>;
            }
            return <p key={i} className="text-foreground leading-relaxed">{p}</p>;
          })}
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