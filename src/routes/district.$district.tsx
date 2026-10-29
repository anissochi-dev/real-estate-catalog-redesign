import { createFileRoute, notFound } from '@tanstack/react-router';
import DistrictPage from '@/pages/DistrictPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { useAppState } from '@/app/AppStateContext';
import { loadDistrictPage, loadDistrictSeoText, districtSeo, SITE_ORIGIN } from '@/lib/ssrData';

const OG_IMAGE = 'https://cdn.poehali.dev/projects/***/files/og-image-1779575751349.png';
const CITY = 'Краснодар';

export const Route = createFileRoute('/district/$district')({
  loader: async ({ params }) => {
    const data = await loadDistrictPage(params.district);
    if (data.notFound) throw notFound();
    const seoText = data.district ? await loadDistrictSeoText(data.district.name, CITY) : '';
    return { district: data.district, allDistricts: data.allDistricts, listings: data.listings, loaded: data.loaded, seoText };
  },
  head: ({ loaderData, params }) => {
    const d = loaderData?.district;
    if (!d) return {};
    const count = loaderData?.loaded ? loaderData.listings.length : null;
    const { title, description } = districtSeo(d, count, CITY);
    const url = `${SITE_ORIGIN}/district/${params.district}`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:image', content: OG_IMAGE },
        { property: 'og:url', content: url },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  notFoundComponent: NotFoundPage,
  component: RoutePage,
});

function RoutePage() {
  const s = useAppState();
  const data = Route.useLoaderData();
  return (
    <DistrictPage
      properties={s.properties}
      initialDistrict={data.district}
      initialAllDistricts={data.allDistricts}
      initialItems={data.loaded ? data.listings : null}
      initialSeoText={data.seoText}
      allLoaded={s.allLoaded}
      favorites={s.favorites}
      compareList={s.compareList}
      onToggleFavorite={s.toggleFavorite}
      onToggleCompare={s.toggleCompare}
    />
  );
}
