import { createFileRoute } from '@tanstack/react-router';
import CatalogPage from '@/pages/CatalogPage';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/catalog/')({
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
