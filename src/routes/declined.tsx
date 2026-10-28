import { createFileRoute } from '@tanstack/react-router';
import { buildPageHead } from '@/lib/ssrData';
import DeclinedPage from '@/pages/DeclinedPage';

export const Route = createFileRoute('/declined')({
  head: () => buildPageHead('/declined', null, { title: 'Доступ ограничен', noindex: true }),
  component: DeclinedPage,
});
