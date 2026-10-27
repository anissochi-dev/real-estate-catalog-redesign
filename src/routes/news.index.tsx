import { createFileRoute } from '@tanstack/react-router';
import { NewsListPage } from '@/pages/NewsPage';

export const Route = createFileRoute('/news/')({
  component: NewsListPage,
});
