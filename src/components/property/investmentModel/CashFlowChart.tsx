import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { YearRow } from './types';
import { fmtMoney } from './modelMath';

interface Props {
  yearly: YearRow[];
}

export default function CashFlowChart({ yearly }: Props) {
  const data = yearly.map(y => ({
    year: `Год ${y.year}`,
    cashFlow: y.cash_flow,
    cumulative: y.cumulative,
  }));

  return (
    <div className="bg-muted/30 rounded-xl p-3">
      <div className="text-xs font-semibold mb-2">Денежный поток по годам</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtMoney(Number(v)).replace(' ₽', '')} />
          <Tooltip
            formatter={(value: number, name: string) => [
              fmtMoney(value),
              name === 'cashFlow' ? 'Поток года' : 'Накоп. итог',
            ]}
            labelStyle={{ fontSize: 11 }}
            contentStyle={{ fontSize: 11, borderRadius: 8 }}
          />
          <ReferenceLine y={0} stroke="#9ca3af" />
          <Bar dataKey="cashFlow" name="cashFlow" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <rect key={i} fill={d.cashFlow >= 0 ? '#10b981' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
