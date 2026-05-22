import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhoneCardModal from './PhoneCardModal';

interface PhoneContact {
  id: number;
  phone: string;
  name: string | null;
  company: string | null;
}

interface Props {
  value: string;
  onChange: (phone: string, name?: string, phoneContactId?: number) => void;
  onNameChange?: (name: string) => void;
  placeholder?: string;
  className?: string;
}

export default function PhonePickerInput({ value, onChange, onNameChange, placeholder = '+7...', className = '' }: Props) {
  const displayValue = value || '+7';
  const [suggestions, setSuggestions] = useState<PhoneContact[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [matchedContact, setMatchedContact] = useState<PhoneContact | null>(null);
  const [cardContactId, setCardContactId] = useState<number | null>(null);
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
    setMatchedContact(null);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminApi.searchPhones(q);
        const contacts: PhoneContact[] = res.contacts || [];
        setSuggestions(contacts.slice(0, 8));
        setOpen(contacts.length > 0);

        // check for exact match
        const normalized = q.replace(/\D/g, '');
        const exact = contacts.find(c => c.phone.replace(/\D/g, '') === normalized);
        setMatchedContact(exact || null);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pick = (c: PhoneContact) => {
    onChange(c.phone, c.name || undefined, c.id);
    if (c.name && onNameChange) onNameChange(c.name);
    setMatchedContact(c);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <>
      <div ref={wrapRef} className={`relative ${className}`}>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              type="tel"
              className="w-full px-3 py-2 border rounded-lg pr-8"
              placeholder={placeholder}
              value={displayValue}
              onChange={e => {
                let v = e.target.value;
                if (!v.startsWith('+7')) v = '+7' + v.replace(/^\+7?/, '');
                // Ограничение: не более 10 цифр после +7
                const digits = v.slice(2).replace(/\D/g, '').slice(0, 10);
                v = '+7' + digits;
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
            {!searching && value && !matchedContact && (
              <Icon name="Phone" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            )}
            {!searching && matchedContact && (
              <Icon name="UserCheck" size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-600" />
            )}
          </div>

          {matchedContact && (
            <button
              type="button"
              onClick={() => setCardContactId(matchedContact.id)}
              className="shrink-0 px-2.5 py-2 rounded-lg border border-brand-blue/30 bg-brand-blue/5 hover:bg-brand-blue/10 text-brand-blue transition"
              title="Открыть карточку контакта"
            >
              <Icon name="ExternalLink" size={14} />
            </button>
          )}
        </div>

        {matchedContact && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
            <Icon name="CheckCircle2" size={12} />
            Найден в базе: <span className="font-semibold">{matchedContact.name || matchedContact.phone}</span>
            {matchedContact.company && <span className="text-muted-foreground">· {matchedContact.company}</span>}
            <button
              type="button"
              onClick={() => setCardContactId(matchedContact.id)}
              className="ml-1 underline hover:no-underline text-brand-blue"
            >
              Открыть карточку
            </button>
          </div>
        )}

        {open && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 font-semibold uppercase tracking-wide">
              Из телефонной базы
            </div>
            {suggestions.map(c => (
              <div key={c.id} className="flex items-center">
                <button
                  type="button"
                  onMouseDown={() => pick(c)}
                  className="flex-1 text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 transition"
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
                <button
                  type="button"
                  onMouseDown={e => { e.stopPropagation(); setCardContactId(c.id); setOpen(false); }}
                  className="px-2 py-2 text-muted-foreground hover:text-brand-blue"
                  title="Открыть карточку"
                >
                  <Icon name="ExternalLink" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {cardContactId !== null && (
        <PhoneCardModal
          contactId={cardContactId}
          onClose={() => setCardContactId(null)}
          onUpdate={() => search(value)}
        />
      )}
    </>
  );
}