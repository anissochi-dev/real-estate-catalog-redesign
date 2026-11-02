import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import PropertyPage from '@/pages/PropertyPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { extractIdFromSlug, listingSlug } from '@/lib/slug';
import { useAppState } from '@/app/AppStateContext';
import { loadListingPage, loadRelated, listingPageTitle, listingSeoDescription, SITE_ORIGIN } from '@/lib/ssrData';

const FALLBACK_OG = 'https://cdn.poehali.dev/projects/4bce74f4-4dd7-424e-85e7-ff08f8399357/files/og-image-1779575751349.png';

export const Route = createFileRoute('/object/$slug')({
  loader: async ({ params }) => {
    const id = extractIdFromSlug(params.slug);
    if (!id) throw notFound();
    const { item, notFound: missing } = await loadListingPage(id);
    if (missing || !item) throw notFound();
    // Один адрес на объект — как в базе и карте сайта. Любой другой (старое название,
    // другая транслитерация) → 301 на основной: без дублей, вес в поиске не делится.
    const canonicalSlug = item.slug || listingSlug(item.title, item.id);
    if (params.slug !== canonicalSlug) {
      throw redirect({ to: '/object/$slug', params: { slug: canonicalSlug }, statusCode: 301 });
    }
    const related = await loadRelated(item);
    return { item, related };
  },
  head: ({ loaderData, params }) => {
    const item = loaderData?.item;
    if (!item) return {};
    const title = listingPageTitle(item);
    const description = listingSeoDescription(item);
    // Превью ссылки — облегчённая копия ~400 px (≈20 КБ), если её нет — главное фото.
    const image = item.image_thumb || (item.images && item.images[0]) || item.image || FALLBACK_OG;
    const url = `${SITE_ORIGIN}/object/${item.slug || params.slug}`;
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
  const { item, related } = Route.useLoaderData();
  return (
    <PropertyPage
      initialItem={item}
      related={related}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
