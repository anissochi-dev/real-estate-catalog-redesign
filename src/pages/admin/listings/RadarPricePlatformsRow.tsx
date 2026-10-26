import Icon from '@/components/ui/icon';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Listing } from './types';
import { HistoryRow, fmt } from './internalCardTypes';
import { MultiStats, parsePriceChange } from './radarTypes';
import RadarBlock from './RadarBlock';

interface Props {
  listing: Listing;
  multiStats: MultiStats | null;
  chartData: { date: string; price: number }[];
  priceRows: HistoryRow[];
  platforms: { key: string; label: string; color: string }[];
}

export default function RadarPricePlatformsRow({ listing, multiStats, chartData, priceRows, platforms }: Props) {
  return (
    <>
  {/* ── Строка 3: История цен + Площадки ── */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

    {/* Мини-график истории цен */}
    <RadarBlock icon="TrendingDown" title="История цены">
      {chartData.length >= 2 ? (
        <>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="radarPriceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                formatter={(v: number) => [`${fmt(v)} ₽`, 'Цена']}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#radarPriceGrad)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1">
            {priceRows.slice(0, 3).map(h => {
              const parsed = parsePriceChange(h.changes)!;
              const diff = parsed.newP - parsed.oldP;
              return (
                <div key={h.id} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(h.created_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                  <span className="font-mono">{fmt(parsed.oldP)} → {fmt(parsed.newP)} ₽</span>
                  <span className={diff < 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {diff > 0 ? '+' : ''}{fmt(diff)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4 flex flex-col items-center gap-1">
          <Icon name="TrendingDown" size={20} className="opacity-30" />
          Цена ещё не менялась
        </div>
      )}
    </RadarBlock>

    {/* Площадки и CRM */}
    <div className="space-y-3">
      <RadarBlock icon="Globe" title="Публикация на площадках">
        <div className="space-y-2">
          {platforms.map(p => {
            const active = !!(listing as unknown as Record<string, unknown>)[p.key];
            return (
              <div key={p.key} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium ${
                active ? p.color : 'bg-muted/30 border-border text-muted-foreground'
              }`}>
                <span>{p.label}</span>
                <div className="flex items-center gap-1">
                  <Icon name={active ? 'CheckCircle2' : 'MinusCircle'} size={13} />
                  <span>{active ? 'Размещён' : 'Не размещён'}</span>
                </div>
              </div>
            );
          })}
        </div>
        {/* Просмотры по площадкам */}
        {multiStats && Object.keys(multiStats.source_totals).length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <div className="text-xs text-muted-foreground font-semibold mb-1">Просмотры по источникам</div>
            {Object.entries(multiStats.source_totals).map(([src, cnt]) => (
              <div key={src} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{multiStats.source_labels[src] || src}</span>
                <span className="font-bold">{fmt(cnt)}</span>
              </div>
            ))}
          </div>
        )}
      </RadarBlock>
    </div>
  </div>
    </>
  );
}
