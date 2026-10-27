import { createFileRoute } from '@tanstack/react-router';
import DistrictPage from '@/pages/DistrictPage';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/district/$district')({
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <DistrictPage
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
