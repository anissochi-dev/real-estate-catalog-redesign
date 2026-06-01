import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { fmtDate } from './types';
import { HistoryRow, fmt } from './internalCardTypes';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Spinner } from './TabOverview';

function parsePriceChange(raw: unknown): { oldP: number; newP: number } | null {
  try {
    const ch = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!ch) return null;
    const p = ch.price;
    if (!p && p !== 0) return null;
    if (Array.isArray(p) && p.length >= 2) return { oldP: Number(p[0]), newP: Number(p[1]) };
    if (typeof p === 'object' && p !== null && ('old' in p || 'new' in p)) return { oldP: Number(p.old ?? 0), newP: Number(p.new ?? 0) };
  } catch { /* ignore */ }
  return null;
}

export function TabPriceHistory({ listingId }: { listingId: number }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getListingHistory(listingId).then(r => {
      const all: HistoryRow[] = (r.history || []).map((h: HistoryRow) => ({
        ...h,
        changes: typeof h.changes === 'string' ? (() => { try { return JSON.parse(h.changes as unknown as string); } catch { return null; } })() : h.changes,
      }));
      setRows(all.filter(h => parsePriceChange(h.changes) !== null));
    }).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;
  if (error) return <div className="p-6 text-center text-red-500 text-sm">{error}</div>;

  if (!rows.length) return (
    <div className="p-6 text-center text-muted-foreground text-sm">История изменений цены не найдена</div>
  );

  const chartData = [...rows].reverse().map(h => {
    const { newP } = parsePriceChange(h.changes)!;
    return {
      date: new Date(h.created_at).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      price: newP,
    };
  });

  const firstPrice = parsePriceChange(rows[rows.length - 1]?.changes)?.oldP;
  if (firstPrice !== undefined && chartData.length > 0) {
    chartData.unshift({ date: '—', price: firstPrice });
  }

  const allPrices = chartData.map(d => d.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.1 || maxPrice * 0.1;

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Icon name="TrendingDown" size={15} className="text-amber-500" />
          История изменений цены
        </div>
        <div className="bg-white rounded-xl border border-border p-4">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[minPrice - padding, maxPrice + padding]}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `${(v / 1_000_000).toFixed(1)}М`}
                width={48}
              />
              <Tooltip
                formatter={(v: number) => [`${fmt(v)} ₽`, 'Цена']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
              <Area type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} fill="url(#priceGrad)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Дата</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Была</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Стала</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Кто изменил</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const parsed = parsePriceChange(h.changes)!;
              const { oldP, newP } = parsed;
              const diff = newP - oldP;
              return (
                <tr key={h.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(h.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{fmt(oldP)} ₽</td>
                  <td className="px-4 py-2 font-mono font-semibold">
                    {fmt(newP)} ₽
                    <span className={`ml-2 text-xs ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{h.user_name || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
