import { createFileRoute } from '@tanstack/react-router';
import { NewsArticlePage } from '@/pages/NewsPage';

export const Route = createFileRoute('/news/$slug')({
  component: NewsArticlePage,
});
