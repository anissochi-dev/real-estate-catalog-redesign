export default function ResultValue({ val, depth = 0 }: { val: unknown; depth?: number }) {
  if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof val === 'boolean') return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${val ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {val ? 'Да' : 'Нет'}
    </span>
  );
  if (typeof val === 'string' || typeof val === 'number') return <span className="break-all">{String(val)}</span>;
  if (Array.isArray(val)) {
    if (!val.length) return <span className="text-muted-foreground text-xs">Не найдено</span>;
    return (
      <div className="space-y-1.5">
        {val.slice(0, 10).map((item, i) => (
          <div key={i} className={depth > 0 ? 'ml-3 pl-2 border-l-2 border-border' : 'bg-muted/40 rounded-lg p-2'}>
            <ResultValue val={item} depth={depth + 1} />
          </div>
        ))}
        {val.length > 10 && <div className="text-xs text-muted-foreground">…ещё {val.length - 10}</div>}
      </div>
    );
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>).filter(([, v]) => v !== null && v !== '' && v !== undefined);
    return (
      <div className="space-y-1">
        {entries.slice(0, 20).map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-muted-foreground min-w-[130px] flex-shrink-0">{k}:</span>
            <span><ResultValue val={v} depth={depth + 1} /></span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}
