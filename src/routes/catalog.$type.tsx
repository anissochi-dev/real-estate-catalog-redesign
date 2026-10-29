import { createFileRoute } from '@tanstack/react-router';
import { notFound } from '@tanstack/react-router';
import CategoryPage from '@/pages/CategoryPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { CATEGORY_META } from '@/pages/category/categoryMeta';
import { useAppState } from '@/app/AppStateContext';
import { loadPageSeo, buildPageHead, loadCategoryPage } from '@/lib/ssrData';

export const Route = createFileRoute('/catalog/$type')({
  loader: async ({ params }) => {
    if (!CATEGORY_META[params.type]) throw notFound();
    const [seo, page] = await Promise.all([
      loadPageSeo(`/catalog/${params.type}`),
      loadCategoryPage(params.type),
    ]);
    return { seo, ...page };
  },
  head: ({ loaderData, params }) => {
    const meta = CATEGORY_META[params.type];
    if (!meta) return {};
    const texts = loaderData?.texts;
    const h1 = texts?.h1 || meta.h1;
    return buildPageHead(`/catalog/${params.type}`, loaderData?.seo, {
      title: `${h1} — БМН`,
      description: texts?.description || meta.description,
      image: 'https://cdn.poehali.dev/projects/***/files/og-image-1779575751349.png',
    });
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  const data = Route.useLoaderData();
  return (
    <CategoryPage
      initial={data}
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
