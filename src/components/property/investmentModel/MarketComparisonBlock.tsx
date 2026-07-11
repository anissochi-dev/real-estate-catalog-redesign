import Icon from '@/components/ui/icon';
import { fmtMoney } from './modelMath';
import { NoiApiResponse, UserParams } from './types';

interface Props {
  data: NoiApiResponse;
  params: UserParams | null;
}

export default function MarketComparisonBlock({ data, params }: Props) {
  if (!(data.price_vs_market || data.comparables?.rent || data.comparables?.sale)) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon name="BarChart3" size={14} className="text-blue-500" />
        Сравнение с рынком
      </div>

      {/* Цена vs рынок */}
      {data.price_vs_market && (() => {
        const pvm = data.price_vs_market!;
        const isAbove = pvm.assessment === 'above';
        const isBelow = pvm.assessment === 'below';
        const color = isAbove
          ? 'text-red-700 bg-red-50 border-red-200'
          : isBelow
          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
          : 'text-blue-700 bg-blue-50 border-blue-200';
        const icon = isAbove ? 'TrendingUp' : isBelow ? 'TrendingDown' : 'Minus';
        const label = isAbove
          ? `Выше рынка на ${Math.abs(pvm.diff_pct)}%`
          : isBelow
          ? `Ниже рынка на ${Math.abs(pvm.diff_pct)}%`
          : 'По рынку';
        return (
          <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${color}`}>
            <Icon name={icon} size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px]">{label}</div>
              <div className="text-[11px] opacity-80 mt-0.5">
                Этот объект: <b>{pvm.obj_price_per_m2.toLocaleString('ru')} ₽/м²</b>
                {' · '}Медиана по {pvm.analogs_count} аналогам: <b>{pvm.market_price_per_m2.toLocaleString('ru')} ₽/м²</b>
                {pvm.district && ` · ${pvm.district}`}
              </div>
              {isAbove && (
                <div className="text-[11px] opacity-70 mt-1">
                  Справедливая цена по рынку: ~{fmtMoney(data.listing.area * pvm.market_price_per_m2)}
                </div>
              )}
              {isBelow && (
                <div className="text-[11px] opacity-70 mt-1">
                  Потенциал роста до рынка: ~{fmtMoney(data.listing.area * (pvm.market_price_per_m2 - pvm.obj_price_per_m2))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Рыночная ставка аренды */}
      {data.comparables?.rent && (() => {
        const r = data.comparables!.rent!;
        // price_per_m2 для аренды уже в ₽/м²/мес (см. load_market_comparables в noi_model.py)
        const snapRentRate = Math.round(r.price_per_m2);
        const benchRentRate = Math.round(params?.rent_rate ?? data.benchmarks.rent_rate);
        const diff = snapRentRate > 0 && benchRentRate > 0
          ? Math.round((snapRentRate / benchRentRate - 1) * 100)
          : 0;
        return (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-background rounded-lg border border-border/50 p-2.5">
              <div className="text-muted-foreground mb-1 flex items-center gap-1">
                <Icon name="Database" size={10} />
                Рыночная ставка аренды
              </div>
              <div className="font-semibold text-sm">{snapRentRate.toLocaleString('ru')} ₽/м²/мес</div>
              <div className="text-muted-foreground mt-0.5">
                {r.analogs_count} аналогов · {r.district}
              </div>
              {diff !== 0 && (
                <div className={`mt-1 text-[10px] font-medium ${diff > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {diff > 0 ? `+${diff}%` : `${diff}%`} vs бенчмарк модели
                </div>
              )}
            </div>
            <div className="bg-background rounded-lg border border-border/50 p-2.5">
              <div className="text-muted-foreground mb-1 flex items-center gap-1">
                <Icon name="Sparkles" size={10} />
                Бенчмарк модели
              </div>
              <div className="font-semibold text-sm">{benchRentRate.toLocaleString('ru')} ₽/м²/мес</div>
              <div className="text-muted-foreground mt-0.5">
                {data.benchmarks.source === 'real_data' ? 'Реальная аренда' : data.benchmarks.source === 'yandex_gpt' ? 'ИИ-оценка' : 'Среднерыночный'}
              </div>
            </div>
          </div>
        );
      })()}

      {data.comparables?.snapshot_date && (
        <div className="text-[10px] text-muted-foreground">
          Данные рынка актуальны на {new Date(data.comparables.snapshot_date).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}