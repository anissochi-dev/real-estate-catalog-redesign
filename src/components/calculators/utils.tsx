export function fmtRub(n: number): string {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} млрд ₽`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} млн ₽`;
  if (Math.abs(n) >= 1000) return `${Math.round(n).toLocaleString('ru')} ₽`;
  return `${Math.round(n)} ₽`;
}

export function fmtNum(n: number, digits = 2): string {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('ru', { maximumFractionDigits: digits });
}

export function fmtPct(n: number, digits = 1): string {
  if (!isFinite(n)) return '—';
  return `${n.toFixed(digits)} %`;
}

export function fmtMonths(n: number): string {
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 12) return `${n.toFixed(1)} мес`;
  const years = Math.floor(n / 12);
  const months = Math.round(n - years * 12);
  return months > 0 ? `${years} г. ${months} мес` : `${years} г.`;
}

interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  step?: number;
  min?: number;
}

export function NumberField({ label, value, onChange, hint, step = 1, min = 0 }: FieldProps) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1 text-foreground">{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:border-brand-blue"
      />
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

interface ResultProps {
  label: string;
  value: string;
  color?: 'blue' | 'green' | 'orange' | 'red';
  hint?: string;
}

export function ResultRow({ label, value, color = 'blue', hint }: ResultProps) {
  const colors = {
    blue: 'text-brand-blue',
    green: 'text-emerald-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  };
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/50 last:border-0">
      <div>
        <div className="text-xs font-semibold text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className={`font-display font-800 text-base ${colors[color]}`}>{value}</div>
    </div>
  );
}
