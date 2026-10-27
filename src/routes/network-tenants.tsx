import { createFileRoute } from '@tanstack/react-router';
import NetworkTenantsPage from '@/pages/NetworkTenantsPage';

export const Route = createFileRoute('/network-tenants')({
  component: NetworkTenantsPage,
});
