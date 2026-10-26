export interface MultiStats {
  listing_id: number;
  views_site: number;
  aggregated: { event_type: string; source: string; total: number; last_at: string }[];
  source_totals: Record<string, number>;
  event_totals: Record<string, number>;
  source_labels: Record<string, string>;
  event_labels: Record<string, string>;
  history: { id: number; event_type: string; source: string; count: number; recorded_at: string }[];
}

export interface BudgetItem {
  id: number; priority: 'high' | 'medium' | 'low';
  days_on_market: number; views_total: number; leads_count: number;
  conversion: number; budget: number;
  channels: { name: string; color: string; budget: number }[];
}

export interface Deal {
  id: number; title: string; stage_name: string; stage_color: string;
  amount: number | null; commission: number | null; created_at: string;
}

export function parsePriceChange(raw: unknown): { oldP: number; newP: number } | null {
  try {
    const ch = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!ch) return null;
    const p = ch.price;
    if (p == null) return null;
    if (Array.isArray(p) && p.length >= 2) return { oldP: Number(p[0]), newP: Number(p[1]) };
    if (typeof p === 'object' && ('old' in p || 'new' in p)) return { oldP: Number(p.old ?? 0), newP: Number(p.new ?? 0) };
  } catch { /* ignore */ }
  return null;
}

export const PRIORITY_CFG = {
  high:   { label: 'Срочно продвигать', cls: 'bg-red-50 border-red-200 text-red-700',    dot: 'bg-red-500',    icon: 'AlertCircle' },
  medium: { label: 'Рекомендуется',     cls: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500',  icon: 'TrendingDown' },
  low:    { label: 'Норма',             cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', icon: 'CheckCircle2' },
};
