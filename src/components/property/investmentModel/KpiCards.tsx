import Icon from '@/components/ui/icon';
import { ModelResult } from './types';
import { fmtMoney } from './modelMath';

interface Props {
  result: ModelResult;
  objectType?: string;
}

/** Вердикт по Cap Rate с учётом типа объекта */
function getCapRateVerdict(cap: number, type?: string): {
  label: string; color: string; bg: string; border: string; icon: string;
} {
  // Нормы Cap Rate по сегментам Краснодара (2025-2026)
  const norms: Record<string, [number, number]> = {
    office:       [8,  12],
    retail:       [8,  11],
    warehouse:    [10, 14],
    restaurant:   [9,  13],
    hotel:        [8,  12],
    gab:          [9,  12],
    business:     [10, 14],
    production:   [11, 15],
    building:     [9,  12],
    free_purpose: [9,  12],
    car_service:  [10, 14],
    land:         [0,   0],  // для земли Cap Rate не считается
  };
  const [lo, hi] = norms[type || 'office'] || [8, 12];

  if (type === 'land') return { label: 'Апрециация', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', icon: 'TrendingUp' };
  if (cap <= 0)   return { label: 'Убыток',    color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    icon: 'TrendingDown' };
  if (cap < lo)   return { label: 'Ниже рынка', color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'AlertTriangle' };
  if (cap <= hi)  return { label: 'В норме',   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'CheckCircle2' };
  return           { label: 'Выше рынка', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'Zap' };
}

/** Общий вердикт по сделке */
function getOverallVerdict(result: ModelResult, type?: string): {
  label: string; desc: string; color: string; bg: string; border: string; icon: string;
} {
  const { cap_rate_pct, irr_pct, npv_10y, noi_year1 } = result;

  if (type === 'land') {
    const irr = irr_pct;
    if (irr >= 15) return { label: '🟢 Хорошая инвестиция', desc: 'Земля показывает высокий потенциал роста стоимости', color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'TrendingUp' };
    if (irr >= 8)  return { label: '🟡 Умеренно', desc: 'Земля растёт в цене, но доходность средняя', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-300', icon: 'Minus' };
    return                { label: '🔴 Слабо', desc: 'Рост стоимости ниже инфляции, рассмотрите альтернативы', color: 'text-red-800', bg: 'bg-red-50', border: 'border-red-300', icon: 'TrendingDown' };
  }

  if (noi_year1 <= 0) return { label: '🔴 Убыточно', desc: 'Операционные расходы превышают доходы. Пересмотрите параметры или цену', color: 'text-red-800', bg: 'bg-red-50', border: 'border-red-300', icon: 'AlertCircle' };

  // Взвешенный скоринг: Cap Rate + IRR + NPV
  let score = 0;
  if (cap_rate_pct >= 10) score += 2; else if (cap_rate_pct >= 7) score += 1;
  if (irr_pct >= 20)      score += 2; else if (irr_pct >= 12)     score += 1;
  if (npv_10y > 0)        score += 1;

  if (score >= 4) return { label: '🟢 Привлекательно', desc: 'Хорошая доходность: Cap Rate и IRR выше рынка', color: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-300', icon: 'ThumbsUp' };
  if (score >= 2) return { label: '🟡 Умеренно',       desc: 'Средняя доходность. Возможен потенциал при оптимизации', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-300', icon: 'Minus' };
  return                  { label: '🔴 Слабо',          desc: 'Низкая доходность или отрицательный NPV. Высокий риск', color: 'text-red-800', bg: 'bg-red-50', border: 'border-red-300', icon: 'ThumbsDown' };
}

export default function KpiCards({ result, objectType }: Props) {
  const capVerdict = getCapRateVerdict(result.cap_rate_pct, objectType);
  const overall = getOverallVerdict(result, objectType);
  const isLand = objectType === 'land';

  const items = [
    {
      label: 'NOI (1-й год)',
      value: isLand ? '—' : fmtMoney(result.noi_year1),
      icon: 'Wallet',
      color: isLand
        ? 'bg-sky-50 text-sky-700 border-sky-200'
        : result.noi_year1 > 0
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-red-50 text-red-700 border-red-200',
      hint: isLand ? 'Земля — доход от апрециации' : 'Чистый операционный доход',
    },
    {
      label: 'Cap Rate',
      value: isLand ? 'N/A' : `${result.cap_rate_pct.toFixed(2)}%`,
      icon: 'Percent',
      color: isLand ? 'bg-sky-50 text-sky-700 border-sky-200' : `${capVerdict.bg} ${capVerdict.color} ${capVerdict.border}`,
      hint: isLand ? 'Для земли — рост цены' : capVerdict.label,
    },
    {
      label: 'NPV (10 лет)',
      value: fmtMoney(result.npv_10y),
      icon: 'TrendingUp',
      color: result.npv_10y >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200',
      hint: `Дисконт ${result.discount_pct.toFixed(1)}% · с выходом из актива`,
    },
    {
      label: 'IRR',
      value: `${result.irr_pct.toFixed(1)}%`,
      icon: 'Activity',
      color: result.irr_pct >= 20 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
           : result.irr_pct >= 12 ? 'bg-blue-50 text-blue-700 border-blue-200'
           : 'bg-amber-50 text-amber-700 border-amber-200',
      hint: result.irr_pct >= 20 ? 'Отлично' : result.irr_pct >= 12 ? 'Хорошо' : 'Ниже ожидаемого',
    },
    {
      label: 'Окупаемость',
      value: result.payback_years != null
        ? `${Number.isInteger(result.payback_years) ? result.payback_years : result.payback_years.toFixed(1)} лет`
        : '>30 лет',
      icon: 'Hourglass',
      color: result.payback_years == null
        ? 'bg-red-50 text-red-600 border-red-200'
        : result.payback_years <= 10
          ? 'bg-purple-50 text-purple-700 border-purple-200'
          : result.payback_years <= 15
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-50 text-slate-500 border-slate-200',
      hint: result.payback_years != null && result.payback_years > 10
        ? 'Долгосрочная инвестиция'
        : result.loan_amount > 0 ? 'С учётом кредита' : 'Без кредита',
    },
  ];

  return (
    <div className="space-y-2">
      {/* Общий вердикт — Traffic Light */}
      <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${overall.bg} ${overall.border}`}>
        <Icon name={overall.icon} size={16} className={`shrink-0 mt-0.5 ${overall.color}`} />
        <div>
          <div className={`font-semibold text-sm ${overall.color}`}>{overall.label}</div>
          <div className={`text-[11px] mt-0.5 ${overall.color} opacity-80`}>{overall.desc}</div>
        </div>
      </div>

      {/* KPI карточки */}
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
    </div>
  );
}