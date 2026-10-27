import { createFileRoute } from '@tanstack/react-router';
import MapPage from '@/pages/MapPage';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/map')({
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <MapPage
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
      allLoaded={s.allLoaded}
    />
  );
}
