import { createFileRoute } from '@tanstack/react-router';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';
import NetworkTenantsPage from '@/pages/NetworkTenantsPage';

export const Route = createFileRoute('/network-tenants')({
  loader: async () => ({ seo: await loadPageSeo('/network-tenants') }),
  head: ({ loaderData }) => buildPageHead('/network-tenants', loaderData?.seo, {
    title: 'Сетевые арендаторы — коммерческая недвижимость с гарантированным доходом',
    description: 'Заявки федеральных и региональных сетей на аренду и покупку коммерческой недвижимости в Краснодаре.',
  }),
  component: NetworkTenantsPage,
});
