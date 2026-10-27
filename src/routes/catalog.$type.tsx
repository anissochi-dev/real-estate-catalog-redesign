import { createFileRoute } from '@tanstack/react-router';
import { notFound } from '@tanstack/react-router';
import CategoryPage from '@/pages/CategoryPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { CATEGORY_META } from '@/pages/category/categoryMeta';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/catalog/$type')({
  loader: ({ params }) => {
    if (!CATEGORY_META[params.type]) throw notFound();
    return null;
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
