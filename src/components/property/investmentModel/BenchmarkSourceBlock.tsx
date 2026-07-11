import Icon from '@/components/ui/icon';
import { fmtMoneyFull } from './modelMath';
import { NoiApiResponse, PRICE_PREDICT_URL } from './types';

interface Props {
  data: NoiApiResponse;
  listingId: number;
  deal?: string;
  refetch: () => void;
  isFetching: boolean;
}

export default function BenchmarkSourceBlock({ data, listingId, deal, refetch, isFetching }: Props) {
  return (
    <>
      {/* Источник бенчмарков */}
      {data.benchmarks.is_gab ? (
        /* ГАБ-режим: объект сдан в аренду, особая раскладка */
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-emerald-800">
            <Icon name="Building2" size={13} className="text-emerald-600" />
            Готовый арендный бизнес — расчёт по фактическому доходу
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="bg-white/70 rounded-lg p-2 border border-emerald-100">
              <div className="text-emerald-700/70 mb-0.5">Аренда в год</div>
              <div className="font-semibold text-emerald-900">{fmtMoneyFull(data.benchmarks.net_income_annual! + data.benchmarks.usn_annual! + data.benchmarks.property_tax_annual!)}</div>
            </div>
            <div className="bg-white/70 rounded-lg p-2 border border-emerald-100">
              <div className="text-emerald-700/70 mb-0.5">УСН 6% + налог</div>
              <div className="font-semibold text-red-600">−{fmtMoneyFull(data.benchmarks.usn_annual! + data.benchmarks.property_tax_annual!)}</div>
            </div>
            <div className="bg-white/70 rounded-lg p-2 border border-emerald-100">
              <div className="text-emerald-700/70 mb-0.5">Чистый доход</div>
              <div className="font-semibold text-emerald-800">{fmtMoneyFull(data.benchmarks.net_income_annual!)}</div>
            </div>
          </div>
          <div className="text-[10px] text-emerald-700/70">
            OPEX = 0 ₽ — все операционные расходы (коммуналка, персонал, обслуживание) несёт арендатор по договору аренды.
          </div>
        </div>
      ) : data.data_source === 'real_rent' ? (
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

      {/* Предупреждение: объект на продажу без арендатора */}
      {!data.listing.has_tenant && deal === 'sale' && (
        <div className="flex items-start gap-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5">
          <Icon name="AlertTriangle" size={12} className="shrink-0 text-amber-600 mt-0.5" />
          <span className="leading-relaxed">
            <span className="font-semibold">Прогнозный сценарий.</span>{' '}
            Объект без действующего арендатора — доходность рассчитана на основе рыночных ставок аренды. Фактические показатели зависят от заполняемости.
          </span>
        </div>
      )}

      {/* Рыночный апсайд для ГАБ */}
      {data.market_rent_rate && data.actual_rent_rate && data.market_rent_rate > data.actual_rent_rate * 1.1 && (
        <div className="flex items-start gap-2 text-[11px] bg-sky-50 border border-sky-200 text-sky-800 rounded-lg px-2.5 py-1.5">
          <Icon name="TrendingUp" size={12} className="shrink-0 text-sky-600 mt-0.5" />
          <span className="leading-relaxed">
            <span className="font-semibold">Апсайд при смене арендатора.</span>{' '}
            Текущая ставка {Math.round(data.actual_rent_rate)} ₽/м²/мес vs рынок {Math.round(data.market_rent_rate)} ₽/м²/мес.{' '}
            Потенциал роста NOI: +{Math.round((data.market_rent_rate / data.actual_rent_rate - 1) * 100)}%
          </span>
        </div>
      )}
    </>
  );
}
