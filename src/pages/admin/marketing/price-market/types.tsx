// ── Типы ─────────────────────────────────────────────────────────────────────

export interface Snapshot {
  snapshot_date: string;
  category: string;
  deal: string;
  district: string;
  price_median: number | null;
  price_min: number | null;
  price_max: number | null;
  price_per_m2_median: number | null;
  analogs_count: number;
}

export interface LatestEntry {
  category: string;
  deal: string;
  district: string;
  price_per_m2_median: number | null;
  price_median: number | null;
  analogs_count: number;
  snapshot_date: string;
}

export interface MarketStats {
  snapshots: Snapshot[];
  latest: LatestEntry[];
  schedule: { enabled: boolean; last_at: string | null; schedule?: string; next_run?: string; in_progress?: boolean; next_source?: string | null };
  available_districts: string[];
  available_combos: { category: string; deal: string }[];
}

// ── Справочники ───────────────────────────────────────────────────────────────

export const CAT_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад',
  building: 'Здание', free_purpose: 'Своб. назн.', production: 'Производство',
  business: 'Готовый бизнес', hotel: 'Гостиница', land: 'Земля',
};

export const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export const PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
];

export const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

// ── Утилиты ───────────────────────────────────────────────────────────────────

export function fmtMoney(n: number | null) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс`;
  return String(Math.round(n));
}

export function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;
}

export function daysSince(s: string | null) {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
}

// ── Пользовательский Tooltip ──────────────────────────────────────────────────

export function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <div className="font-semibold mb-2 text-muted-foreground">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-semibold">{p.value?.toLocaleString('ru')} ₽</span>
        </div>
      ))}
    </div>
  );
}
