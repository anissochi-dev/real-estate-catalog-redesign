import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { AnySearchItem } from './eventModalHooks';

interface SearchDropdownProps {
  label: string;
  icon: string;
  colorClass: string;
  value: string;
  hasSelected: boolean;
  selectedSub?: string;
  onSelect: (item: AnySearchItem) => void;
  onClear: () => void;
  items: AnySearchItem[];
  loading: boolean;
  onSearch: (q: string) => void;
  placeholder: string;
  renderItem?: (item: AnySearchItem) => React.ReactNode;
}

export default function SearchDropdown({
  label, icon, colorClass, value, hasSelected, selectedSub, onSelect, onClear,
  items, loading, onSearch, placeholder, renderItem,
}: SearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className={`text-[10px] font-semibold flex items-center gap-1 mb-1 ${colorClass}`}>
        <Icon name={icon} size={10} />{label}
      </label>
      {hasSelected ? (
        <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colorClass} bg-white border-current/30`}>
          <div className="truncate">
            <div className="font-semibold">{value}</div>
            {selectedSub && <div className="text-[10px] opacity-70">{selectedSub}</div>}
          </div>
          <button type="button" onClick={onClear} className="ml-1 shrink-0 hover:opacity-60">
            <Icon name="X" size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            value={value}
            onChange={e => { onSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="text-xs pr-7"
          />
          {loading && (
            <Icon name="Loader2" size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {open && items.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
              {items.map(item => (
                <button
                  key={String(item.id)}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted transition text-xs border-b border-border/30 last:border-0"
                  onMouseDown={() => { onSelect(item); setOpen(false); }}
                >
                  {renderItem ? renderItem(item) : (
                    <>
                      <div className="font-medium truncate">{item.label}</div>
                      {item.sub && <div className="text-muted-foreground truncate">{item.sub}</div>}
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
          {open && !loading && value.length >= 2 && items.length === 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg px-3 py-2 text-xs text-muted-foreground">
              Ничего не найдено
            </div>
          )}
        </div>
      )}
    </div>
  );
}
