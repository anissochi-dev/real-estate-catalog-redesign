import { createFileRoute } from '@tanstack/react-router';
import LeadDetailPage from '@/pages/leads/LeadDetailPage';

export const Route = createFileRoute('/request/$slug')({
  component: LeadDetailPage,
});
