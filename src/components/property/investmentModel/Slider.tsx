interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  benchmark?: number;
  onChange: (v: number) => void;
}

export default function Slider({ label, value, min, max, step, unit = '', benchmark, onChange }: Props) {
  const fmt = (n: number) => {
    if (n >= 1000) return n.toLocaleString('ru');
    return String(Number.isInteger(n) ? n : n.toFixed(1));
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">
          {fmt(value)}{unit}
          {benchmark != null && Math.abs(value - benchmark) > step / 2 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">
              · рынок {fmt(benchmark)}{unit}
            </span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand-blue cursor-pointer"
      />
    </div>
  );
}
