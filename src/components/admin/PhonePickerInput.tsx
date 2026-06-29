import { useEffect, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import PhoneCardModal from './PhoneCardModal';
import { formatPhone, normalizePhone, extractDigits } from '@/lib/phone';
import { usePhoneFlag } from '@/hooks/usePhoneFlag';
import PhoneFlagBadge from '@/components/PhoneFlagBadge';

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
  readOnly?: boolean;
}

export default function PhonePickerInput({ value, onChange, onNameChange, placeholder, className = '', readOnly = false }: Props) {
  const [inputDisplay, setInputDisplay] = useState(() => value ? formatPhone(value) : '');
  const [suggestions, setSuggestions] = useState<PhoneContact[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [matchedContact, setMatchedContact] = useState<PhoneContact | null>(null);
  const [cardContactId, setCardContactId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // синхронизируем display когда value меняется снаружи
  useEffect(() => {
    setInputDisplay(value ? formatPhone(value) : '');
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (normalized: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMatchedContact(null);
    const digits = extractDigits(normalized);
    if (!digits || digits.length < 10) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminApi.searchPhones(normalized);
        const contacts: PhoneContact[] = res.contacts || [];
        setSuggestions(contacts.slice(0, 8));
        setOpen(contacts.length > 0);

        // автодополнение: если есть единственное совпадение начала
        const exact = contacts.find(c => extractDigits(c.phone) === digits);
        if (exact) {
          setMatchedContact(exact);
        } else if (contacts.length === 1 && extractDigits(contacts[0].phone).startsWith(digits)) {
          // подсвечиваем как кандидата, но не выбираем автоматически
        }
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const oldValue = el.value;
    const cursorPos = el.selectionStart ?? oldValue.length;

    const oldFullRaw = oldValue.replace(/\D/g, '');
    const rawPosBefore = oldValue.slice(0, cursorPos).replace(/\D/g, '').length;

    const digits = extractDigits(oldValue).slice(0, 10);
    const normalized = digits ? '+7' + digits : '';
    const display = digits ? formatPhone('+7' + digits) : '';
    setInputDisplay(display);
    onChange(normalized);
    search(normalized);
    if (!digits) { setSuggestions([]); setOpen(false); setMatchedContact(null); }

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newFormatted = inputRef.current.value;
      const newFullRaw = newFormatted.replace(/\D/g, '');
      const delta = newFullRaw.length - oldFullRaw.length;
      const rawPosAfter = Math.max(0, Math.min(rawPosBefore + delta, newFullRaw.length));

      let newCursorPos = newFormatted.length;
      if (rawPosAfter < newFullRaw.length) {
        let digitCount = 0;
        for (let i = 0; i < newFormatted.length; i++) {
          if (/\d/.test(newFormatted[i])) {
            if (digitCount === rawPosAfter) { newCursorPos = i; break; }
            digitCount++;
          }
        }
      }
      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  const pick = (c: PhoneContact) => {
    const display = formatPhone(c.phone);
    setInputDisplay(display);
    onChange(c.phone, c.name || undefined, c.id);
    if (c.name && onNameChange) onNameChange(c.name);
    setMatchedContact(c);
    setOpen(false);
    setSuggestions([]);
  };

  const copyPhone = () => {
    const formatted = formatPhone(value);
    if (!formatted) return;
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const digits = extractDigits(value);
  const isComplete = digits.length === 10;
  const { flag } = usePhoneFlag(value);

  return (
    <>
      <div ref={wrapRef} className={`relative ${className}`}>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="tel"
              className={`w-full px-3 py-2 border rounded-lg pr-8 font-mono tracking-wide ${readOnly ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : ''}`}
              placeholder={placeholder ?? '+7 900 000-00-00'}
              value={inputDisplay}
              readOnly={readOnly}
              onChange={readOnly ? undefined : handleInputChange}
              onFocus={readOnly ? undefined : e => {
                const len = e.target.value.length;
                setTimeout(() => e.target.setSelectionRange(len, len), 0);
                if (digits.length >= 10 && suggestions.length > 0) setOpen(true);
              }}
              autoComplete="off"
            />
            {/* Иконка внутри инпута — всегда занимает место, меняется состояние */}
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              {searching
                ? <Icon name="Loader2" size={14} className="text-muted-foreground animate-spin" />
                : matchedContact
                  ? <Icon name="UserCheck" size={14} className="text-emerald-600" />
                  : <Icon name="Phone" size={14} className={isComplete ? 'text-muted-foreground/50' : 'text-muted-foreground/20'} />
              }
            </span>
          </div>

          {/* Кнопка копирования — всегда в разметке, невидима пока номер не полный */}
          <button
            type="button"
            onClick={copyPhone}
            disabled={!isComplete}
            title="Скопировать номер"
            className={`shrink-0 px-2.5 py-2 rounded-lg border transition ${
              !isComplete
                ? 'invisible'
                : copied
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                  : 'border-border text-muted-foreground hover:border-brand-blue hover:text-brand-blue'
            }`}
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={14} />
          </button>
        </div>

        {/* Подсказка под инпутом — фиксированная высота, контент меняется без сдвига */}
        <div className="mt-1 h-4 flex items-center">
          {matchedContact ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 truncate">
              <Icon name="CheckCircle2" size={12} className="shrink-0" />
              <span className="font-semibold truncate">{matchedContact.name || formatPhone(matchedContact.phone)}</span>
              {matchedContact.company && <span className="text-muted-foreground truncate">· {matchedContact.company}</span>}
              <button
                type="button"
                onClick={() => setCardContactId(matchedContact.id)}
                className="ml-1 underline hover:no-underline text-brand-blue shrink-0"
              >
                Карточка
              </button>
            </div>
          ) : !isComplete ? (
            <span className="text-[11px] text-muted-foreground">
              Пример: <span className="font-mono">+7 900 123-45-67</span>
            </span>
          ) : null}
        </div>

        {/* Флаг номера — плохой собственник / конкурент */}
        {flag && (
          <div className="mt-2">
            <PhoneFlagBadge flag={flag} size="md" />
          </div>
        )}

        {/* Дропдаун с подсказками */}
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 font-semibold uppercase tracking-wide">
              Из телефонной базы
            </div>
            {suggestions.map(c => {
              const cDigits = extractDigits(c.phone);
              const inputDigits = extractDigits(value);
              // подсветим если у контакта более длинный номер — это «автодополнение»
              const isAutocomplete = cDigits.startsWith(inputDigits) && cDigits !== inputDigits;
              return (
                <div key={c.id} className="flex items-center">
                  <button
                    type="button"
                    onMouseDown={() => pick(c)}
                    className={`flex-1 text-left px-3 py-2 hover:bg-muted/60 flex items-center gap-2 transition ${isAutocomplete ? 'bg-brand-blue/3' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
                      <Icon name="User" size={13} className="text-brand-blue" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono font-semibold truncate flex items-center gap-1.5">
                        {formatPhone(c.phone)}
                        {isAutocomplete && (
                          <span className="text-[10px] font-sans font-normal text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded">
                            дополнить
                          </span>
                        )}
                      </div>
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
              );
            })}
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

/** Вспомогательный хук: форматированное значение для отображения в read-only режиме */
export { formatPhone, normalizePhone };