import { createFileRoute } from '@tanstack/react-router';
import HomePage from '@/pages/HomePage';
import { useAppState } from '@/app/AppStateContext';
import { loadHomeStats, loadPageSeo, buildPageHead } from '@/lib/ssrData';

const HOME_TITLE = 'Коммерческая недвижимость в Краснодаре — аренда и продажа';
const HOME_DESC = 'Коммерческая недвижимость и готовый бизнес в Краснодаре с 2007 г. Офисы, торговые площади, склады, рестораны, гостиницы. Подбор за 2 минуты с ИИ.';

export const Route = createFileRoute('/')({
  // Статистика главной (число объектов по категориям) — на сервере, без «нулей» до загрузки.
  loader: async () => {
    const [stats, seo] = await Promise.all([loadHomeStats(), loadPageSeo('/')]);
    return { stats, seo };
  },
  head: ({ loaderData }) => buildPageHead('/', loaderData?.seo, { title: HOME_TITLE, description: HOME_DESC }),
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  const { stats } = Route.useLoaderData();
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
