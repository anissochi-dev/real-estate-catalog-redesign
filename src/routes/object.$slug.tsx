import { createFileRoute } from '@tanstack/react-router';
import { notFound } from '@tanstack/react-router';
import PropertyPage from '@/pages/PropertyPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { extractIdFromSlug } from '@/lib/slug';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/object/$slug')({
  loader: ({ params }) => {
    if (!extractIdFromSlug(params.slug)) throw notFound();
    return null;
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <PropertyPage
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
