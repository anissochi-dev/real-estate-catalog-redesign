import { createFileRoute, notFound } from '@tanstack/react-router';
import { NewsArticlePage } from '@/pages/NewsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { loadNewsArticle, clipText, SITE_ORIGIN } from '@/lib/ssrData';

export const Route = createFileRoute('/news/$slug')({
  loader: async ({ params }) => {
    const { article, notFound: missing } = await loadNewsArticle(params.slug);
    if (missing) throw notFound();
    return { article };
  },
  head: ({ loaderData, params }) => {
    const a = loaderData?.article;
    if (!a) return {};
    const title = clipText(a.title, 90);
    const description = clipText(a.summary || a.content || a.title, 160);
    const url = `${SITE_ORIGIN}/news/${params.slug}`;
    const meta = [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ];
    if (a.image_url) {
      meta.push({ property: 'og:image', content: a.image_url }, { name: 'twitter:image', content: a.image_url });
    }
    return { meta, links: [{ rel: 'canonical', href: url }] };
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const { article } = Route.useLoaderData();
  return <NewsArticlePage initialArticle={article} />;
}
