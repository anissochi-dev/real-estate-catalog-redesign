import Icon from '@/components/ui/icon';
import Slider from './Slider';
import { Benchmarks, UserParams } from './types';

interface Props {
  bench: Benchmarks;
  params: UserParams;
  setParam: <K extends keyof UserParams>(key: K, value: UserParams[K]) => void;
  onReset: () => void;
}

export default function ParametersPanel({ bench, params, setParam, onReset }: Props) {
  return (
    <div className="bg-muted/30 rounded-xl p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <Icon name="Sliders" size={14} className="text-brand-blue" />
          Параметры модели
        </div>
        <button onClick={onReset} className="text-xs text-brand-blue hover:underline flex items-center gap-1">
          <Icon name="RotateCcw" size={11} />Сбросить
        </button>
      </div>

      {/* Доход и расходы */}
      <div className="space-y-3">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Доход и расходы</div>
        <Slider
          label="Арендная ставка"
          value={params.rent_rate}
          benchmark={bench.rent_rate}
          min={Math.max(50, Math.round(bench.rent_rate * 0.4))}
          max={Math.round(bench.rent_rate * 2)}
          step={10}
          unit=" ₽/м²/мес"
          onChange={v => setParam('rent_rate', v)}
        />
        <Slider
          label="Вакантность"
          value={params.vacancy_pct}
          benchmark={bench.vacancy_pct}
          min={0}
          max={40}
          step={1}
          unit="%"
          onChange={v => setParam('vacancy_pct', v)}
        />
        <Slider
          label="OPEX (содержание)"
          value={params.opex_per_m2}
          benchmark={bench.opex_per_m2}
          min={0}
          max={Math.max(800, Math.round(bench.opex_per_m2 * 2))}
          step={10}
          unit=" ₽/м²/мес"
          onChange={v => setParam('opex_per_m2', v)}
        />
        <Slider
          label="Налог на имущество"
          value={params.property_tax_pct}
          benchmark={bench.property_tax_pct}
          min={0}
          max={3}
          step={0.1}
          unit="%"
          onChange={v => setParam('property_tax_pct', v)}
        />
        <Slider
          label="Индексация ставки"
          value={params.avg_indexation_pct}
          benchmark={bench.avg_indexation_pct}
          min={0}
          max={15}
          step={0.5}
          unit="%/год"
          onChange={v => setParam('avg_indexation_pct', v)}
        />
      </div>

      {/* Кредитный рычаг */}
      <div className="space-y-3 pt-2 border-t border-border/60">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Кредитный рычаг</div>
        <Slider
          label="LTV (доля кредита)"
          value={params.ltv_pct}
          min={0}
          max={80}
          step={5}
          unit="%"
          onChange={v => setParam('ltv_pct', v)}
        />
        {params.ltv_pct > 0 && (
          <>
            <Slider
              label="Ставка по кредиту"
              value={params.loan_rate_pct}
              min={8}
              max={30}
              step={0.5}
              unit="%"
              onChange={v => setParam('loan_rate_pct', v)}
            />
            <Slider
              label="Срок кредита"
              value={params.loan_years}
              min={1}
              max={20}
              step={1}
              unit=" лет"
              onChange={v => setParam('loan_years', v)}
            />
          </>
        )}
      </div>

      {/* Что-если */}
      <div className="space-y-3 pt-2 border-t border-border/60">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Что-если</div>
        <Slider
          label="Ключевая ставка ЦБ"
          value={params.cb_rate_pct}
          min={5}
          max={30}
          step={0.5}
          unit="%"
          onChange={v => setParam('cb_rate_pct', v)}
        />
        <Slider
          label="Рост ставки от инфры (метро)"
          value={params.infra_rent_uplift_pct}
          min={0}
          max={50}
          step={1}
          unit="%"
          onChange={v => setParam('infra_rent_uplift_pct', v)}
        />
        {params.infra_rent_uplift_pct > 0 && (
          <Slider
            label="Год вступления (после открытия)"
            value={params.infra_year}
            min={1}
            max={10}
            step={1}
            unit=" год"
            onChange={v => setParam('infra_year', v)}
          />
        )}
      </div>
    </div>
  );
}
