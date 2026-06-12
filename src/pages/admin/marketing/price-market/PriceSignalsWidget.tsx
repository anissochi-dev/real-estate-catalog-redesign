import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { PREDICT_URL, CAT_LABELS } from './types';

interface PriceBiweekly {
  date_recorded: string;
  category: string;
  deal_type: string;
  price_per_m2: number;
  change_pct: number;
}

interface BiweeklyData {
  rows: PriceBiweekly[];
  dates: string[];
}

const DEAL_LABELS: Record<string, string> = { sale: 'продажа', rent: 'аренда' };
const THRESHOLD = 3.0;

function Arrow({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.1) return <span className="text-muted-foreground">→</span>;
  return pct > 0
    ? <span className="text-emerald-600 font-bold">↑</span>
    : <span className="text-red-500 font-bold">↓</span>;
}

function ChangeChip({ pct }: { pct: number }) {
  const abs = Math.abs(pct);
  const big = abs >= THRESHOLD;
  const pos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
      big
        ? pos ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
        : 'bg-muted text-muted-foreground'
    }`}>
      {pos ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function PriceSignalsWidget() {
  const [data, setData] = useState<BiweeklyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dealFilter, setDealFilter] = useState<'sale' | 'rent' | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${PREDICT_URL}?action=price_biweekly_stats`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="Loader2" size={15} className="animate-spin" />
      Загрузка ценовых сигналов…
    </div>
  );

  if (!data || !data.rows.length) return null;

  const rows = data.rows.filter(r => dealFilter === 'all' || r.deal_type === dealFilter);
  const significant = rows.filter(r => Math.abs(r.change_pct) >= THRESHOLD);
  const shown = showAll ? rows : rows.slice(0, 12);

  const latestDate = data.dates[0] || '';
  const prevDate = data.dates[1] || '';

  const fmtDate = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      {/* Шапка */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-blue/10 flex items-center justify-center">
            <Icon name="TrendingUp" size={16} className="text-brand-blue" />
          </div>
          <div>
            <div className="font-display font-700 text-sm text-foreground flex items-center gap-2">
              Ценовые сигналы
              {significant.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <Icon name="AlertTriangle" size={10} />
                  {significant.length} значимых
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {latestDate && prevDate
                ? `Сравнение ${fmtDate(latestDate)} vs ${fmtDate(prevDate)}`
                : 'Изменения за последний срез'}
            </div>
          </div>
        </div>
        <Icon name={collapsed ? 'ChevronDown' : 'ChevronUp'} size={16} className="text-muted-foreground" />
      </div>

      {!collapsed && (
        <>
          {/* Фильтр */}
          <div className="px-5 pb-3 flex items-center gap-2 border-b border-border">
            <div className="flex gap-1 bg-muted/40 rounded-xl p-0.5">
              {(['all', 'sale', 'rent'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDealFilter(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    dealFilter === d ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {d === 'all' ? 'Все' : DEAL_LABELS[d]}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">
              Порог сигнала: ±{THRESHOLD}%
            </span>
          </div>

          {/* Сигналы значимых изменений */}
          {significant.length > 0 && (
            <div className="px-5 py-3 border-b border-border bg-amber-50/50">
              <div className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                <Icon name="Zap" size={13} className="text-amber-600" />
                Значимые изменения (≥{THRESHOLD}%)
              </div>
              <div className="flex flex-wrap gap-2">
                {significant.map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-white border border-border rounded-xl px-3 py-1.5 text-xs shadow-sm">
                    <Arrow pct={r.change_pct} />
                    <span className="font-medium">{CAT_LABELS[r.category] || r.category}</span>
                    <span className="text-muted-foreground">({DEAL_LABELS[r.deal_type] || r.deal_type})</span>
                    <ChangeChip pct={r.change_pct} />
                    <span className="text-muted-foreground font-normal">
                      {r.price_per_m2 >= 1000
                        ? `${Math.round(r.price_per_m2 / 1000)} тыс ₽/м²`
                        : `${Math.round(r.price_per_m2)} ₽/м²`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Полная таблица */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">Категория</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Сделка</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">₽/м²</th>
                  <th className="text-right px-5 py-2.5 font-semibold text-muted-foreground">Изм.</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const isSig = Math.abs(r.change_pct) >= THRESHOLD;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-border/50 last:border-0 transition-colors ${
                        isSig ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-muted/20'
                      }`}
                    >
                      <td className="px-5 py-2.5 font-medium flex items-center gap-1.5">
                        <Arrow pct={r.change_pct} />
                        {CAT_LABELS[r.category] || r.category}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{DEAL_LABELS[r.deal_type] || r.deal_type}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        {r.price_per_m2 >= 1000
                          ? `${(r.price_per_m2 / 1000).toFixed(0)} тыс`
                          : Math.round(r.price_per_m2)}
                        <span className="font-normal text-muted-foreground"> ₽</span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <ChangeChip pct={r.change_pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 12 && (
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={() => setShowAll(s => !s)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1"
              >
                <Icon name={showAll ? 'ChevronUp' : 'ChevronDown'} size={13} />
                {showAll ? 'Свернуть' : `Показать все ${rows.length} позиций`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
