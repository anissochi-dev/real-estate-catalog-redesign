import { useState, useEffect, useRef } from 'react';
import { formatPhone, normalizePhone, extractDigits } from '@/lib/phone';

interface Props {
  value: string;
  onChange: (normalized: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function PublicPhoneInput({ value, onChange, placeholder = '+7 900 000-00-00', className = '', required }: Props) {
  const [display, setDisplay] = useState(() => value ? formatPhone(value) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const formatted = value ? formatPhone(value) : '';
    setDisplay(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const oldValue = el.value;
    const cursorPos = el.selectionStart ?? oldValue.length;

    const oldFullRaw = oldValue.replace(/\D/g, '');
    const rawPosBefore = oldValue.slice(0, cursorPos).replace(/\D/g, '').length;

    const digits = extractDigits(oldValue).slice(0, 10);
    const normalized = digits ? normalizePhone('+7' + digits) : '';
    const formatted = digits ? formatPhone('+7' + digits) : '';
    setDisplay(formatted);
    onChange(normalized);

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

  return (
    <input
      ref={inputRef}
      type="tel"
      required={required}
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      autoComplete="tel"
      className={`font-mono tracking-wide ${className}`}
    />
  );
}