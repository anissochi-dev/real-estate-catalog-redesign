import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { District } from '../districts/DistrictsTypes';

export default function DistrictDropdown({ districts, selected, onChange, error }: {
  districts: District[];
  selected: number[];
  onChange: (ids: number[]) => void;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const label = selected.length === 0
    ? 'Выберите районы...'
    : selected.length === 1
      ? districts.find(d => d.id === selected[0])?.name || '1 район'
      : `${selected.length} района(ов)`;

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-muted-foreground mb-1 block">
        Желаемые районы <span className="text-red-500">*</span>
        {error && <span className="ml-2 text-red-500 font-normal">— обязательное поле</span>}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm bg-white transition-colors ${error ? 'border-red-400 bg-red-50' : 'hover:border-brand-blue'}`}
      >
        <span className={selected.length === 0 ? 'text-muted-foreground' : 'text-foreground'}>
          {label}
        </span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-muted border-b border-border"
            >
              Очистить выбор
            </button>
          )}
          {districts.map(d => (
            <label key={d.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                onChange={() => toggle(d.id)}
                className="accent-brand-blue"
              />
              <span className="text-sm">{d.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
