import { createFileRoute } from '@tanstack/react-router';
import DeclinedPage from '@/pages/DeclinedPage';

export const Route = createFileRoute('/declined')({
  component: DeclinedPage,
});
