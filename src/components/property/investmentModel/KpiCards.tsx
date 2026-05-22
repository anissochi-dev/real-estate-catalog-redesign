import Icon from '@/components/ui/icon';
import { ModelResult } from './types';
import { fmtMoney } from './modelMath';

interface Props {
  result: ModelResult;
}

export default function KpiCards({ result }: Props) {
  const items = [
    {
      label: 'NOI (1-й год)',
      value: fmtMoney(result.noi_year1),
      icon: 'Wallet',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      hint: 'Чистый операционный доход',
    },
    {
      label: 'Cap Rate',
      value: `${result.cap_rate_pct.toFixed(2)}%`,
      icon: 'Percent',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      hint: 'Ставка капитализации',
    },
    {
      label: 'NPV (10 лет)',
      value: fmtMoney(result.npv_10y),
      icon: 'TrendingUp',
      color: result.npv_10y >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200',
      hint: `Дисконт ${result.discount_pct.toFixed(1)}%`,
    },
    {
      label: 'IRR',
      value: `${result.irr_pct.toFixed(1)}%`,
      icon: 'Activity',
      color: result.irr_pct >= 12 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
      hint: 'Внутренняя норма доходности',
    },
    {
      label: 'Окупаемость',
      value: result.payback_years != null ? `${result.payback_years} лет` : '>10 лет',
      icon: 'Hourglass',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      hint: 'С учётом кредита',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
      {items.map(it => (
        <div key={it.label} className={`rounded-xl border p-3 ${it.color}`}>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold opacity-80">
            <Icon name={it.icon} size={11} />
            {it.label}
          </div>
          <div className="font-display font-700 text-lg leading-tight mt-0.5">{it.value}</div>
          <div className="text-[10px] opacity-70 mt-0.5">{it.hint}</div>
        </div>
      ))}
    </div>
  );
}
