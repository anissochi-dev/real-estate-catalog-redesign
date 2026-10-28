import { createFileRoute, notFound } from '@tanstack/react-router';
import LeadDetailPage, { leadHeading } from '@/pages/leads/LeadDetailPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { loadLeadPage, buildPageHead } from '@/lib/ssrData';

const OG_IMAGE = 'https://cdn.poehali.dev/projects/***/bucket/f8de2a72-faf3-4f8b-aaa2-0ee00c7e16dc.png';

export const Route = createFileRoute('/request/$slug')({
  loader: async ({ params }) => {
    const data = await loadLeadPage(params.slug);
    if (data.notFound) throw notFound();
    return { lead: data.lead, similar: data.similar, districts: data.districts };
  },
  head: ({ loaderData, params }) => {
    const lead = loaderData?.lead;
    if (!lead) return {};
    const h = leadHeading(lead, loaderData?.districts || []);
    return buildPageHead(`/request/${params.slug}`, null, { title: h.title, description: h.description, image: OG_IMAGE });
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const data = Route.useLoaderData();
  return <LeadDetailPage initial={data} />;
}
