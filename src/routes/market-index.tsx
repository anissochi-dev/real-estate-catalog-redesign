import { createFileRoute } from '@tanstack/react-router';
import MarketIndexPage from '@/pages/market-index/MarketIndexPage';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';

export const Route = createFileRoute('/market-index')({
  loader: async () => ({ seo: await loadPageSeo('/market-index') }),
  head: ({ loaderData }) => buildPageHead('/market-index', loaderData?.seo, {
    title: 'Цены на коммерческую недвижимость в Краснодаре — аренда и продажа | Индекс цен',
    description: 'Актуальные медианные цены за м² на офисы, торговые помещения, склады и другую коммерческую недвижимость в Краснодаре. Динамика цен по районам, обновление ежедневно.',
  }),
  component: MarketIndexPage,
});
