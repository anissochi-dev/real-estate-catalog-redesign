import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/pages/HomePage';
import { useAppState } from '@/app/AppStateContext';
import { loadHomeStats } from '@/lib/ssrData';

export const Route = createFileRoute('/')({
  // Статистика главной (число объектов по категориям) — на сервере, без «нулей» до загрузки.
  loader: () => loadHomeStats(),
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  const stats = Route.useLoaderData();
  return (
    <HomePage
      properties={s.properties}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
      initialStats={stats ?? undefined}
    />
  );
}
