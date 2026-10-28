import { createFileRoute } from '@tanstack/react-router';
import { notFound } from '@tanstack/react-router';
import CategoryPage from '@/pages/CategoryPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { CATEGORY_META } from '@/pages/category/categoryMeta';
import { useAppState } from '@/app/AppStateContext';
import { loadPageSeo, buildPageHead } from '@/lib/ssrData';

export const Route = createFileRoute('/catalog/$type')({
  loader: async ({ params }) => {
    if (!CATEGORY_META[params.type]) throw notFound();
    return { seo: await loadPageSeo(`/catalog/${params.type}`) };
  },
  head: ({ loaderData, params }) => {
    const meta = CATEGORY_META[params.type];
    if (!meta) return {};
    return buildPageHead(`/catalog/${params.type}`, loaderData?.seo, {
      title: `${meta.h1} — БМН`,
      description: meta.description,
      image: 'https://cdn.poehali.dev/projects/***/files/og-image-1779575751349.png',
    });
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <CategoryPage
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
