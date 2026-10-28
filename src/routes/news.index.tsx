import { createFileRoute } from '@tanstack/react-router';
import { NewsListPage } from '@/pages/NewsPage';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';

export const Route = createFileRoute('/news/')({
  loader: async () => ({ seo: await loadPageSeo('/news') }),
  head: ({ loaderData }) => buildPageHead('/news', loaderData?.seo, {
    title: 'Новости коммерческой недвижимости Краснодара — аналитика рынка',
    description: 'Актуальные новости и аналитика рынка коммерческой недвижимости Краснодара и Краснодарского края.',
  }),
  component: NewsListPage,
});
