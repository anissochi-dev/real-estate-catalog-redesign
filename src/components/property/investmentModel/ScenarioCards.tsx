import Icon from '@/components/ui/icon';
import { ModelResult, Scenarios } from './types';
import { fmtMoney } from './modelMath';

interface Props {
  base: ModelResult;
  scenarios: Scenarios;
}

const DEFS: { key: keyof Omit<Scenarios, 'base'>; icon: string; title: string; description: string; color: string }[] = [
  { key: 'cb_up_4pct',   icon: 'TrendingUp',   title: 'ЦБ повысит ставку до 25%',      description: 'Дороже кредит, выше дисконт',          color: 'bg-red-50 border-red-200 text-red-700' },
  { key: 'cb_down_6pct', icon: 'TrendingDown', title: 'ЦБ снизит ставку до 15%',        description: 'Дешевле деньги, выше NPV',             color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { key: 'metro_open',   icon: 'TrainTrack',   title: 'Метро/инфра рядом через 3 года', description: '+15% к ставке аренды',                 color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'leverage_50',  icon: 'Banknote',     title: 'Покупка с кредитом 50% LTV',     description: 'Ставка 22%, срок 10 лет',              color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { key: 'growth_high',  icon: 'Rocket',       title: 'Рост рынка: индексация +3%',     description: 'Сильнее индексация ставок',            color: 'bg-amber-50 border-amber-200 text-amber-700' },
];

export default function ScenarioCards({ base, scenarios }: Props) {
  const delta = (a: number, b: number) => {
    if (!b) return 0;
    return ((a - b) / Math.abs(b)) * 100;
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold flex items-center gap-1.5">
        <Icon name="Sparkles" size={14} className="text-brand-blue" />
        Сценарии «Что-если» — сравнение с базовым
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEFS.map(def => {
          const s = scenarios[def.key];
          if (!s) return null;
          const npvDelta = delta(s.npv_10y, base.npv_10y);
          const irrDelta = s.irr_pct - base.irr_pct;
          return (
            <div key={def.key} className={`rounded-xl border p-3 ${def.color}`}>
              <div className="flex items-start gap-2 mb-2">
                <Icon name={def.icon} size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold leading-tight">{def.title}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{def.description}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <div className="opacity-70">NPV</div>
                  <div className="font-semibold text-xs leading-tight">{fmtMoney(s.npv_10y)}</div>
                  <div className={`text-[9px] ${npvDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {npvDelta >= 0 ? '+' : ''}{npvDelta.toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="opacity-70">IRR</div>
                  <div className="font-semibold text-xs leading-tight">{s.irr_pct.toFixed(1)}%</div>
                  <div className={`text-[9px] ${irrDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {irrDelta >= 0 ? '+' : ''}{irrDelta.toFixed(1)}п.п.
                  </div>
                </div>
                <div>
                  <div className="opacity-70">Окуп.</div>
                  <div className="font-semibold text-xs leading-tight">
                    {s.payback_years != null ? `${s.payback_years} л.` : '>10 л.'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
