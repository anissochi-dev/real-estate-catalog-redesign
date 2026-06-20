import { useRef } from 'react';
import Icon from '@/components/ui/icon';
import { formatPhone, extractDigits } from '@/lib/phone';

interface Props {
  ownerName: string;
  setOwnerName: (v: string) => void;
  ownerPhone: string;
  setOwnerPhone: (v: string) => void;
  phoneDisplay: string;
  setPhoneDisplay: (v: string) => void;
  ownerEmail: string;
  setOwnerEmail: (v: string) => void;
  honeypot: string;
  setHoneypot: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  errors: Record<string, string>;
  setErrors: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  inputCls: (field: string) => string;
}

export default function OwnerSubmitStepContact({
  ownerName, setOwnerName,
  ownerPhone, setOwnerPhone,
  phoneDisplay, setPhoneDisplay,
  ownerEmail, setOwnerEmail,
  honeypot, setHoneypot,
  consent, setConsent,
  errors, setErrors,
  inputCls,
}: Props) {
  const phoneRef = useRef<HTMLInputElement>(null);

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const oldValue = el.value;
    const cursorPos = el.selectionStart ?? oldValue.length;
    const oldFullRaw = oldValue.replace(/\D/g, '');
    const rawPosBefore = oldValue.slice(0, cursorPos).replace(/\D/g, '').length;

    const digits = extractDigits(oldValue).slice(0, 10);
    const normalized = digits ? '+7' + digits : '';
    const display = digits ? formatPhone('+7' + digits) : '';

    setOwnerPhone(normalized);
    setPhoneDisplay(display);
    setErrors(er => ({ ...er, ownerPhone: '' }));

    requestAnimationFrame(() => {
      if (!phoneRef.current) return;
      const newFormatted = phoneRef.current.value;
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
      phoneRef.current.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-brand-blue mb-1">
        <Icon name="User" size={16} />
        <span className="font-semibold text-sm">Ваши контакты</span>
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Ваше имя *</label>
        <input
          value={ownerName}
          onChange={e => { setOwnerName(e.target.value); setErrors(er => ({ ...er, ownerName: '' })); }}
          placeholder="Иван Петров"
          className={inputCls('ownerName')}
        />
        {errors.ownerName && <div className="text-xs text-red-500 mt-1">{errors.ownerName}</div>}
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Телефон *</label>
        <input
          ref={phoneRef}
          value={phoneDisplay}
          onChange={handlePhone}
          onFocus={e => {
            const len = e.target.value.length;
            setTimeout(() => e.target.setSelectionRange(len, len), 0);
          }}
          placeholder="+7 900 000-00-00"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          className={`${inputCls('ownerPhone')} font-mono tracking-wide`}
        />
        {errors.ownerPhone
          ? <div className="text-xs text-red-500 mt-1">{errors.ownerPhone}</div>
          : <div className="text-[11px] text-muted-foreground mt-1">
              Пример: <span className="font-mono">+7 900 123-45-67</span>
            </div>
        }
      </div>

      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">
          Email <span className="font-normal opacity-60">(необязательно)</span>
        </label>
        <input
          value={ownerEmail}
          onChange={e => setOwnerEmail(e.target.value)}
          placeholder="ivan@mail.ru"
          type="email"
          className={inputCls('ownerEmail')}
        />
      </div>

      {/* Honeypot — скрыто от людей, боты заполняют */}
      <div style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }} aria-hidden="true" tabIndex={-1}>
        <label>Website</label>
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <label className={`flex items-start gap-2.5 cursor-pointer rounded-xl p-3 border transition ${
        errors.consent ? 'border-red-300 bg-red-50' : 'border-border hover:bg-muted/30'
      }`}>
        <input
          type="checkbox"
          checked={consent}
          onChange={e => { setConsent(e.target.checked); setErrors(er => ({ ...er, consent: '' })); }}
          className="mt-0.5 accent-brand-blue w-4 h-4 shrink-0"
        />
        <span className="text-xs text-muted-foreground leading-relaxed">
          Согласен на обработку персональных данных в соответствии с политикой конфиденциальности
        </span>
      </label>
      {errors.consent && <div className="text-xs text-red-500 -mt-2">{errors.consent}</div>}
    </div>
  );
}
