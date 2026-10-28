import { createFileRoute } from '@tanstack/react-router';
import LeadsListPage from '@/pages/LeadsListPage';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';

export const Route = createFileRoute('/leads')({
  loader: async () => ({ seo: await loadPageSeo('/leads') }),
  head: ({ loaderData }) => buildPageHead('/leads', loaderData?.seo, {
    title: 'Заявки клиентов на коммерческую недвижимость в Краснодаре',
    description: 'Реальные заявки от арендаторов и покупателей коммерческой недвижимости в Краснодаре: офисы, склады, торговые площади, рестораны, гостиницы.',
  }),
  component: LeadsListPage,
});
