import { createFileRoute } from '@tanstack/react-router';
import CatalogPage from '@/pages/CatalogPage';
import { useAppState } from '@/app/AppStateContext';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';

export const Route = createFileRoute('/catalog/')({
  loader: async () => ({ seo: await loadPageSeo('/catalog') }),
  head: ({ loaderData }) => buildPageHead('/catalog', loaderData?.seo, {
    title: 'Каталог коммерческой недвижимости в Краснодаре — аренда и продажа',
    description: 'Каталог коммерческой недвижимости в Краснодаре: офисы, склады, торговые площади, готовый бизнес. Актуальные цены, фото и карта.',
  }),
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <CatalogPage
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
      allLoaded={s.allLoaded}
    />
  );
}
