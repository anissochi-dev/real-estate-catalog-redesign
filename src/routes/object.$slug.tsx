import { createFileRoute, notFound } from '@tanstack/react-router';
import PropertyPage from '@/pages/PropertyPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { extractIdFromSlug } from '@/lib/slug';
import { useAppState } from '@/app/AppStateContext';
import { loadListingPage, clipText, listingPageTitle, SITE_ORIGIN } from '@/lib/ssrData';

const FALLBACK_OG = 'https://cdn.poehali.dev/projects/***/files/og-image-1779575751349.png';

export const Route = createFileRoute('/object/$slug')({
  loader: async ({ params }) => {
    const id = extractIdFromSlug(params.slug);
    if (!id) throw notFound();
    const { item, notFound: missing } = await loadListingPage(id);
    if (missing) throw notFound();
    return { item };
  },
  head: ({ loaderData, params }) => {
    const item = loaderData?.item;
    if (!item) return {};
    const title = listingPageTitle(item);
    const description = clipText(item.seoDescription || item.description || item.title, 160);
    const image = (item.images && item.images[0]) || item.image || FALLBACK_OG;
    const url = `${SITE_ORIGIN}/object/${params.slug}`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'product' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: image },
        { property: 'og:url', content: url },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  const { item } = Route.useLoaderData();
  return (
    <PropertyPage
      initialItem={item}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
