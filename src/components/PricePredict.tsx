import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PriceRange { min: number | null; max: number | null; }
interface Assessment { label: string; color: string; delta_pct: number; }
interface Demand { score: number; label: string; color: string; }

interface PredictResult {
  market_price: number | null;
  price_per_m2_median: number | null;
  price_range: PriceRange;
  payback_months: number | null;
  monthly_income_est: number | null;
  demand: Demand;
  price_assessment: Assessment;
  comparables_count: number;
  data_source: 'db_comparables' | 'market_norms';
}

interface Props {
  listingId: number;
  currentPrice: number;
  deal: string;
}

const COLOR_MAP: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-50',
  green:   'text-green-600 bg-green-50',
  blue:    'text-blue-600 bg-blue-50',
  amber:   'text-amber-600 bg-amber-50',
  red:     'text-red-600 bg-red-50',
  gray:    'text-slate-500 bg-slate-50',
};

const DEMAND_BAR: Record<string, string> = {
  emerald: 'bg-emerald-500',
  green:   'bg-green-500',
  blue:    'bg-blue-500',
  amber:   'bg-amber-400',
  red:     'bg-red-400',
  gray:    'bg-slate-300',
};

function fmt(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' млн ₽';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс. ₽';
  return n.toLocaleString('ru') + ' ₽';
}

function fmtPayback(months: number | null): string {
  if (!months) return '—';
  if (months < 12) return `${months} мес.`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0 ? `${y} г. ${m} мес.` : `${y} лет`;
}

export default function PricePredict({ listingId, currentPrice, deal }: Props) {
  const [data, setData] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    setError(false);
    fetch(`${PREDICT_URL}?id=${listingId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(true); return; }
        setData(d as PredictResult);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [listingId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
        <div className="h-5 bg-slate-100 rounded w-48 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const assessColor = COLOR_MAP[data.price_assessment.color] || COLOR_MAP.gray;
  const demandBar = DEMAND_BAR[data.demand.color] || DEMAND_BAR.gray;
  const demandColor = COLOR_MAP[data.demand.color] || COLOR_MAP.gray;
  const demandWidth = Math.round((data.demand.score / 10) * 100);

  const showPayback = deal === 'sale' || deal === 'business';
  const isNorms = data.data_source === 'market_norms';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-700 text-base flex items-center gap-2">
          <Icon name="TrendingUp" size={16} className="text-brand-blue" />
          Аналитика цены
        </h3>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${assessColor}`}>
          {data.price_assessment.label}
          {data.price_assessment.delta_pct !== 0 && (
            <> {data.price_assessment.delta_pct > 0 ? '+' : ''}{data.price_assessment.delta_pct}%</>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Рыночная цена */}
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Icon name="BarChart2" size={11} />
            Рыночная цена
          </div>
          <div className="font-display font-700 text-sm text-foreground">
            {fmt(data.market_price)}
          </div>
          {data.price_range.min && data.price_range.max && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {fmt(data.price_range.min)} — {fmt(data.price_range.max)}
            </div>
          )}
        </div>

        {/* Цена за м² */}
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Icon name="Scaling" size={11} />
            Медиана ₽/м²
          </div>
          <div className="font-display font-700 text-sm text-foreground">
            {data.price_per_m2_median ? data.price_per_m2_median.toLocaleString('ru') + ' ₽' : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            по {data.comparables_count} {
              data.comparables_count === 1 ? 'объекту' :
              data.comparables_count < 5 ? 'объектам' : 'объектам'
            }
          </div>
        </div>

        {/* Окупаемость */}
        {showPayback && (
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Icon name="Clock" size={11} />
              Окупаемость
            </div>
            <div className="font-display font-700 text-sm text-foreground">
              {fmtPayback(data.payback_months)}
            </div>
            {data.monthly_income_est && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ~{fmt(data.monthly_income_est)}/мес.
              </div>
            )}
          </div>
        )}

        {/* Спрос */}
        <div className="bg-slate-50 rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Icon name="Users" size={11} />
            Спрос
          </div>
          <div className={`text-xs font-semibold mb-1 ${demandColor.split(' ')[0]}`}>
            {data.demand.label}
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${demandBar}`}
              style={{ width: `${demandWidth}%` }}
            />
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/60 flex items-start gap-1 mt-2 pt-2 border-t border-border">
        <Icon name="Info" size={10} className="flex-shrink-0 mt-0.5" />
        <span>
          {isNorms ? 'Расчёт по рыночным нормативам Краснодарского края. ' : `По ${data.comparables_count} аналогам в базе. `}
          Информация представлена в ознакомительных целях.
        </span>
      </div>
    </div>
  );
}