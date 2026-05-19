import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface PhoneContact {
  id: number;
  phone: string;
  name: string | null;
  company: string | null;
}

interface Props {
  value: string;
  onChange: (phone: string, name?: string) => void;
  onNameChange?: (name: string) => void;
  placeholder?: string;
  className?: string;
}

export default function PhonePickerInput({ value, onChange, onNameChange, placeholder = '+7...', className = '' }: Props) {
  const displayValue = value || '+7';
  const [suggestions, setSuggestions] = useState<PhoneContact[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminApi.searchPhones(q);
        const contacts: PhoneContact[] = res.contacts || [];
        setSuggestions(contacts.slice(0, 8));
        setOpen(contacts.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pick = (c: PhoneContact) => {
    onChange(c.phone, c.name || undefined);
    if (c.name && onNameChange) onNameChange(c.name);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="tel"
          className="w-full px-3 py-2 border rounded-lg pr-8"
          placeholder={placeholder}
          value={displayValue}
          onChange={e => {
            let v = e.target.value;
            if (!v.startsWith('+7')) v = '+7' + v.replace(/^\+7?/, '');
            onChange(v);
            search(v);
          }}
          onFocus={e => {
            if (!value) onChange('+7');
            const len = e.target.value.length;
            setTimeout(() => e.target.setSelectionRange(len, len), 0);
            if (displayValue.length >= 2 && suggestions.length > 0) setOpen(true);
          }}
          autoComplete="off"
        />
        {searching && (
          <Icon name="Loader2" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
        {!searching && value && (
          <Icon name="Phone" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 font-semibold uppercase tracking-wide">
            Из телефонной базы
          </div>
          {suggestions.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => pick(c)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 transition"
            >
              <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
                <Icon name="User" size={13} className="text-brand-blue" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{c.phone}</div>
                {(c.name || c.company) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.name, c.company].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}