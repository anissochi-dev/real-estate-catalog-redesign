import { createFileRoute } from '@tanstack/react-router';
import ComparePage from '@/pages/ComparePage';
import { useAppState } from '@/app/AppStateContext';

export const Route = createFileRoute('/compare')({
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  return (
    <ComparePage
      properties={s.compareProperties}
      onRemove={(id: number) => s.toggleCompare(id)}
      onNavigate={s.setCurrentPage}
    />
  );
}
