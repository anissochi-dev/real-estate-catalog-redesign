import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CAT_LABELS, PALETTE, CustomTooltip } from './types';

interface MarketIndexTrendProps {
  trendData: Record<string, string | number>[];
  selectedCats: string[];
  onToggleCat: (cat: string) => void;
  availableCats: string[];
}

export default function MarketIndexTrend({ trendData, selectedCats, onToggleCat, availableCats }: MarketIndexTrendProps) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-700 text-base">Динамика цены за м²</h3>
        <div className="flex flex-wrap gap-1.5">
          {availableCats.map(cat => (
            <button
              key={cat}
              onClick={() => onToggleCat(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                selectedCats.includes(cat)
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {CAT_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      </div>
      {trendData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Пока недостаточно данных для графика</p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selectedCats.map((cat, i) => (
              <Line
                key={cat} type="monotone" dataKey={cat} name={CAT_LABELS[cat] || cat}
                stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
