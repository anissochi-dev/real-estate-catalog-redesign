import { CAT_LABELS, DEAL_LABELS, fmtMoney, type LatestEntry } from './types';

interface MarketIndexTableProps {
  latest: LatestEntry[];
}

export default function MarketIndexTable({ latest }: MarketIndexTableProps) {
  const cityWide = latest
    .filter(l => !l.district && l.price_per_m2_median)
    .sort((a, b) => (CAT_LABELS[a.category] || a.category).localeCompare(CAT_LABELS[b.category] || b.category));

  if (cityWide.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <h3 className="font-display font-700 text-base mb-4">Актуальные медианы по городу</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground text-xs">
              <th className="py-2 pr-3 font-medium">Категория</th>
              <th className="py-2 pr-3 font-medium">Сделка</th>
              <th className="py-2 pr-3 font-medium text-right">₽/м²</th>
              <th className="py-2 pr-3 font-medium text-right">Медиана цены</th>
              <th className="py-2 font-medium text-right">Объектов</th>
            </tr>
          </thead>
          <tbody>
            {cityWide.map((row, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="py-2.5 pr-3 font-medium">{CAT_LABELS[row.category] || row.category}</td>
                <td className="py-2.5 pr-3 text-muted-foreground">{DEAL_LABELS[row.deal] || row.deal}</td>
                <td className="py-2.5 pr-3 text-right font-semibold text-brand-blue">
                  {row.price_per_m2_median?.toLocaleString('ru')} ₽
                </td>
                <td className="py-2.5 pr-3 text-right text-muted-foreground">{fmtMoney(row.price_median)} ₽</td>
                <td className="py-2.5 text-right text-muted-foreground">{row.analogs_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
