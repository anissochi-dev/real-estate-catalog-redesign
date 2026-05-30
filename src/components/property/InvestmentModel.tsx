import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/ui/icon';
import KpiCards from './investmentModel/KpiCards';
import ParametersPanel from './investmentModel/ParametersPanel';
import ScenarioCards from './investmentModel/ScenarioCards';

const CashFlowChart = lazy(() => import('./investmentModel/CashFlowChart'));
import { fmtMoneyFull } from './investmentModel/modelMath';
import { computeModel } from './investmentModel/modelMath';
import { NoiApiResponse, PRICE_PREDICT_URL, UserParams } from './investmentModel/types';

interface Props {
  listingId: number;
  price: number;
  area: number;
  deal?: string;
}

const buildInitialParams = (api: NoiApiResponse): UserParams => ({
  rent_rate: api.benchmarks.rent_rate,
  vacancy_pct: api.benchmarks.vacancy_pct,
  opex_per_m2: api.benchmarks.opex_per_m2,
  property_tax_pct: api.benchmarks.property_tax_pct,
  avg_indexation_pct: api.benchmarks.avg_indexation_pct,
  cb_rate_pct: 21,
  ltv_pct: 0,
  loan_rate_pct: 22, // актуальная ставка для коммерческой ипотеки
  loan_years: 10,
  infra_rent_uplift_pct: 0,
  infra_year: 0,
});

export default function InvestmentModel({ listingId, price, area, deal }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    if (data && !params) setParams(buildInitialParams(data));
  }, [data, params]);

  const setParam = <K extends keyof UserParams>(key: K, value: UserParams[K]) => {
    setParams(p => (p ? { ...p, [key]: value } : p));
  };

  const reset = () => {
    if (data) setParams(buildInitialParams(data));
  };

  const liveResult = useMemo(() => {
    if (!data || !params) return null;
    return computeModel({ area: data.listing.area, price: data.listing.price }, data.benchmarks, params);
  }, [data, params]);

  // Не показываем для сделок «аренда» — модель строится на покупке актива
  if (deal === 'rent') return null;

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden border border-blue-200">
      {/* Шапка */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 hover:from-sky-100 hover:via-blue-100 hover:to-indigo-100 transition text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <Icon name="TrendingUp" size={16} className="text-blue-500" />
          </div>
          <div>
            <div className="font-display font-700 text-base flex items-center gap-1.5 text-blue-900">
              Инвест-модель NOI
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-700 font-semibold">AI</span>
            </div>
            <div className="text-[11px] text-blue-600/70">
              Cap Rate · NPV · IRR · payback с рычагом · «Что-если»
            </div>
          </div>
        </div>
        <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={18} className="text-blue-400 shrink-0" />
      </button>

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
              {/* Источник бенчмарков */}
              {data.data_source === 'real_rent' ? (
                <div className="flex items-start gap-2 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-2.5 py-1.5">
                  <Icon name="CheckCircle2" size={12} className="shrink-0 text-emerald-600 mt-0.5" />
                  <span className="leading-relaxed">
                    <span className="font-semibold">Реальные данные аренды</span>
                    {data.benchmarks.comment ? <span className="text-emerald-700/80"> · {data.benchmarks.comment}</span> : null}
                  </span>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-start gap-1.5 flex-1">
                    <Icon name={data.benchmarks.source === 'yandex_gpt' ? 'Sparkles' : 'Database'} size={11} className="shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <span className="font-semibold">{data.benchmarks.source === 'yandex_gpt' ? 'ИИ-оценка бенчмарков' : 'Среднерыночные данные'}:</span>{' '}
                      {data.benchmarks.comment}
                    </span>
                  </div>
                  <button
                    onClick={() => fetch(`${PRICE_PREDICT_URL}?action=noi_model&listing_id=${listingId}&refresh=1`).then(() => refetch())}
                    disabled={isFetching}
                    className="text-[10px] underline shrink-0 disabled:opacity-50 mt-0.5"
                    title="Обновить рыночную оценку"
                  >
                    {isFetching ? 'Обновляю…' : 'Обновить'}
                  </button>
                </div>
              )}

              {/* KPI */}
              <KpiCards result={liveResult} />

              {/* Параметры + график */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ParametersPanel bench={data.benchmarks} params={params} setParam={setParam} onReset={reset} />
                <div className="space-y-3">
                  <Suspense fallback={<div className="h-[200px] bg-muted/30 rounded-xl animate-pulse" />}>
                    <CashFlowChart yearly={liveResult.yearly} />
                  </Suspense>

                  <button
                    onClick={() => setShowAdvanced(s => !s)}
                    className="w-full text-xs text-brand-blue hover:underline flex items-center justify-center gap-1"
                  >
                    <Icon name={showAdvanced ? 'ChevronUp' : 'ChevronDown'} size={12} />
                    {showAdvanced ? 'Скрыть детали' : 'Показать раскладку доходов'}
                  </button>

                  {showAdvanced && (
                    <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-xs">
                      <div className="font-semibold text-sm mb-1">Раскладка 1-го года</div>
                      <Row label="Потенциальный доход (GPI)" value={fmtMoneyFull(liveResult.gpi_year1)} />
                      <Row label="Эффективный доход (EGI, с вакантностью)" value={fmtMoneyFull(liveResult.egi_year1)} />
                      <Row label="− Операционные расходы" value={fmtMoneyFull(-liveResult.opex_year1)} negative />
                      <Row label="− Налог на имущество" value={fmtMoneyFull(-liveResult.tax_year1)} negative />
                      <Row label="= NOI" value={fmtMoneyFull(liveResult.noi_year1)} bold />
                      {liveResult.loan_amount > 0 && (
                        <>
                          <Row label="Сумма кредита" value={fmtMoneyFull(liveResult.loan_amount)} />
                          <Row label="Обслуживание долга (год)" value={fmtMoneyFull(-liveResult.debt_service_annual)} negative />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Сценарии */}
              <ScenarioCards base={liveResult} scenarios={data.scenarios} />

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

function Row({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-semibold pt-1 border-t border-border/60' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={negative ? 'text-red-600' : ''}>{value}</span>
    </div>
  );
}