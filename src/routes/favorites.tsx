import { createFileRoute } from '@tanstack/react-router';
import FavoritesPage from '@/pages/FavoritesPage';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/favorites')({
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <FavoritesPage
      properties={s.favoriteProperties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
