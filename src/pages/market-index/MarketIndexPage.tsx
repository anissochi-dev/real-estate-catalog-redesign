import Icon from '@/components/ui/icon';
import SeoHead, { useSeoH1 } from '@/components/SeoHead';
import SchemaOrg, { makeBreadcrumbSchema, makeFaqSchema } from '@/components/SchemaOrg';
import PropertyFaqSection from '@/components/property/PropertyFaqSection';
import { getSiteUrl } from '@/lib/siteUrl';
import { useSettings } from '@/contexts/SettingsContext';
import { useMarketIndexData } from './useMarketIndexData';
import MarketIndexHero from './MarketIndexHero';
import MarketIndexTrend from './MarketIndexTrend';
import MarketIndexDistricts from './MarketIndexDistricts';
import MarketIndexSupply from './MarketIndexSupply';
import MarketIndexTable from './MarketIndexTable';
import MarketIndexSeoBlock from './MarketIndexSeoBlock';
import { MARKET_INDEX_FAQ } from './marketIndexFaq';

export default function MarketIndexPage() {
  const { settings } = useSettings();
  const h1 = useSeoH1('Индекс цен коммерческой недвижимости Краснодара');
  const {
    loading, filterDeal, setFilterDeal, selectedCats, toggleCat,
    availableCats, trendData, supplyData, compareData, totalAnalogs, updatedAt, data,
  } = useMarketIndexData();

  const siteUrl = getSiteUrl(settings.site_url);
  const bcSchema = makeBreadcrumbSchema([
    { name: 'Главная', url: siteUrl },
    { name: 'Индекс цен', url: `${siteUrl}/market-index` },
  ]);
  const faqSchema = makeFaqSchema(MARKET_INDEX_FAQ);

  const noData = !loading && (!data || data.snapshots.length === 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <SeoHead
        path="/market-index"
        h1={h1}
        title={`Цены на коммерческую недвижимость в Краснодаре — аренда и продажа | ${settings.company_name || 'Индекс цен'}`}
        description="Актуальные медианные цены за м² на офисы, торговые помещения, склады и другую коммерческую недвижимость в Краснодаре. Динамика цен по районам, обновление ежедневно."
        keywords="цены на коммерческую недвижимость Краснодар, стоимость аренды офиса, цена м² склад, аналитика рынка недвижимости"
      />
      <SchemaOrg schema={bcSchema} id="market-index-bc" />
      <SchemaOrg schema={faqSchema} id="market-index-faq" />

      <MarketIndexHero updatedAt={updatedAt} totalAnalogs={totalAnalogs} />

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterDeal('rent')}
          className={`text-sm px-4 py-2 rounded-xl font-semibold border transition ${
            filterDeal === 'rent' ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Аренда
        </button>
        <button
          onClick={() => setFilterDeal('sale')}
          className={`text-sm px-4 py-2 rounded-xl font-semibold border transition ${
            filterDeal === 'sale' ? 'bg-brand-blue text-white border-brand-blue' : 'border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Продажа
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Icon name="Loader2" size={28} className="animate-spin text-brand-blue" />
        </div>
      )}

      {noData && (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <Icon name="BarChart2" size={36} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm">Данные пока собираются, загляните чуть позже</p>
        </div>
      )}

      {!loading && !noData && (
        <div className="space-y-6">
          <MarketIndexTrend
            trendData={trendData}
            selectedCats={selectedCats}
            onToggleCat={toggleCat}
            availableCats={availableCats}
          />
          <MarketIndexSupply
            supplyData={supplyData}
            selectedCats={selectedCats}
            onToggleCat={toggleCat}
            availableCats={availableCats}
          />
          <MarketIndexDistricts
            compareData={compareData}
            selectedCats={selectedCats}
            onToggleCat={toggleCat}
            availableCats={availableCats}
          />
          <MarketIndexTable latest={data?.latest ?? []} />
        </div>
      )}

      <MarketIndexSeoBlock city={settings.main_city || 'Краснодар'} />
      <PropertyFaqSection faq={MARKET_INDEX_FAQ} faqLoading={false} />
    </div>
  );
}