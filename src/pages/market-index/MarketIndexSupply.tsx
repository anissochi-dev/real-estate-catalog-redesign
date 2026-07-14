import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import Icon from '@/components/ui/icon';
import { CAT_LABELS, PALETTE } from './types';

interface MarketIndexSupplyProps {
  supplyData: Record<string, string | number>[];
  selectedCats: string[];
  onToggleCat: (cat: string) => void;
  availableCats: string[];
}

function SupplyTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <div className="font-semibold mb-2 text-muted-foreground">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">{p.value} объектов</span>
        </div>
      ))}
    </div>
  );
}

export default function MarketIndexSupply({ supplyData, selectedCats, onToggleCat, availableCats }: MarketIndexSupplyProps) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-display font-700 text-base flex items-center gap-1.5">
            <Icon name="BarChart3" size={16} className="text-brand-blue" />
            Динамика предложения
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Сколько объектов в продаже/аренде находим на рынке по категориям</p>
        </div>
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
      {supplyData.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Пока недостаточно данных для графика</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={supplyData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<SupplyTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selectedCats.map((cat, i) => (
              <Area
                key={cat} type="monotone" dataKey={cat} name={CAT_LABELS[cat] || cat}
                stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.15} strokeWidth={2} connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
