import { createFileRoute } from '@tanstack/react-router';
import LeadsListPage from '@/pages/LeadsListPage';

export const Route = createFileRoute('/leads')({
  component: LeadsListPage,
});
