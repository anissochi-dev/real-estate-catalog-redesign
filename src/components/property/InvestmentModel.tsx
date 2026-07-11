import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import KpiCards from './investmentModel/KpiCards';
import ParametersPanel from './investmentModel/ParametersPanel';
import ScenarioCards from './investmentModel/ScenarioCards';
import AnalogsMetaBlock from './investmentModel/AnalogsMetaBlock';
import InvestmentModelHeader from './investmentModel/InvestmentModelHeader';
import BenchmarkSourceBlock from './investmentModel/BenchmarkSourceBlock';
import MarketComparisonBlock from './investmentModel/MarketComparisonBlock';
import CashFlowSection from './investmentModel/CashFlowSection';
import { computeModel } from './investmentModel/modelMath';
import { NoiApiResponse, PRICE_PREDICT_URL, UserParams } from './investmentModel/types';

interface Props {
  listingId: number;
  price: number;
  area: number;
  deal?: string;
  rentIndexPct?: number | null;
}

const buildInitialParams = (api: NoiApiResponse): UserParams => ({
  rent_rate: api.benchmarks.rent_rate,
  vacancy_pct: api.benchmarks.vacancy_pct,
  opex_per_m2: api.benchmarks.opex_per_m2,
  property_tax_pct: api.benchmarks.property_tax_pct,
  avg_indexation_pct: api.benchmarks.avg_indexation_pct, // переопределяется ниже если задано брокером
  cb_rate_pct: 21,
  ltv_pct: 0,
  loan_rate_pct: 22,
  loan_years: 10,
  infra_rent_uplift_pct: 0,
  infra_year: 0,
});

export default function InvestmentModel({ listingId, price, area, deal, rentIndexPct }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [refreshingAnalogs, setRefreshingAnalogs] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery<NoiApiResponse>({
    queryKey: ['noi-model', listingId],
    queryFn: async () => {
      const r = await fetch(`${PRICE_PREDICT_URL}?action=noi_model&listing_id=${listingId}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      return r.json();
    },
    enabled: expanded && price > 0 && area > 0,
    staleTime: 10 * 60_000,
  });

  const [params, setParams] = useState<UserParams | null>(null);
  useEffect(() => {
    if (data && !params) {
      const initial = buildInitialParams(data);
      if (rentIndexPct != null) initial.avg_indexation_pct = rentIndexPct;
      setParams(initial);
    }
  }, [data, params, rentIndexPct]);

  const setParam = <K extends keyof UserParams>(key: K, value: UserParams[K]) => {
    setParams(p => (p ? { ...p, [key]: value } : p));
  };

  const reset = () => {
    if (data) setParams(buildInitialParams(data));
  };

  const handleRefreshAnalogs = async () => {
    setRefreshingAnalogs(true);
    setParams(null);
    try {
      await fetch(`${PRICE_PREDICT_URL}?action=noi_model&listing_id=${listingId}&refresh=1`);
      await refetch();
    } finally {
      setRefreshingAnalogs(false);
    }
  };

  const liveResult = useMemo(() => {
    if (!data || !params) return null;
    return computeModel(
      { area: data.listing.area, price: data.listing.price, type: data.listing.type },
      data.benchmarks,
      params,
    );
  }, [data, params]);

  // Не показываем для сделок «аренда» — модель строится на покупке актива
  if (deal === 'rent') return null;

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden border border-blue-200">
      <InvestmentModelHeader expanded={expanded} onToggle={() => setExpanded(v => !v)} />

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Icon name="Loader2" size={16} className="animate-spin" />
              ИИ оценивает рыночные бенчмарки…
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
              <Icon name="AlertCircle" size={14} />
              {(error as Error).message || 'Не удалось загрузить инвест-модель'}
              <button onClick={() => refetch()} className="ml-auto text-xs underline">Повторить</button>
            </div>
          )}

          {data && liveResult && params && (
            <>
              <BenchmarkSourceBlock
                data={data}
                listingId={listingId}
                deal={deal}
                refetch={refetch}
                isFetching={isFetching}
              />

              {/* Блок аналогов — откуда данные для бенчмарков */}
              {data.analogs_meta && (
                <AnalogsMetaBlock
                  meta={data.analogs_meta}
                  onRefresh={handleRefreshAnalogs}
                  refreshing={refreshingAnalogs || isFetching}
                />
              )}

              {/* KPI */}
              <KpiCards result={liveResult} objectType={data.listing.type} />

              {/* Параметры + график */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ParametersPanel bench={data.benchmarks} params={params} setParam={setParam} onReset={reset} />
                <CashFlowSection liveResult={liveResult} benchmarks={data.benchmarks} />
              </div>

              {/* Сценарии */}
              <ScenarioCards base={liveResult} scenarios={data.scenarios} />

              {/* Аналоги с рынка */}
              <MarketComparisonBlock data={data} params={params} />

              {/* Дисклеймер */}
              <div className="text-[10px] text-muted-foreground border-t border-border/60 pt-2 leading-relaxed">
                Модель носит ориентировочный характер и не является инвестиционной рекомендацией.
                Бенчмарки оценены ИИ на основе среднерыночных данных Краснодара. Для сделки запросите due diligence.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
