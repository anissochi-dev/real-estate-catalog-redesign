import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CAT_LABELS, PALETTE, CustomTooltip } from './types';

interface MarketIndexDistrictsProps {
  compareData: Record<string, string | number>[];
  selectedCats: string[];
  onToggleCat: (cat: string) => void;
  availableCats: string[];
}

export default function MarketIndexDistricts({ compareData, selectedCats, onToggleCat, availableCats }: MarketIndexDistrictsProps) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-700 text-base">Цена за м² по районам</h3>
        <div className="flex flex-wrap gap-1.5">
          {availableCats.slice(0, 6).map(cat => (
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
      {compareData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Нет данных по районам</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={compareData} margin={{ top: 5, right: 10, bottom: 40, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="district" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}к`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selectedCats.map((cat, i) => (
              <Bar key={cat} dataKey={cat} name={CAT_LABELS[cat] || cat} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
