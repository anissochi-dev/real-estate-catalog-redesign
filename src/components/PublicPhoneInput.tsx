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

    // Считаем цифры ДО курсора в старом значении
    const digitsBeforeCursor = oldValue.slice(0, cursorPos).replace(/\D/g, '').length;

    const digits = extractDigits(oldValue).slice(0, 10);
    const normalized = digits ? normalizePhone('+7' + digits) : '';
    const formatted = digits ? formatPhone('+7' + digits) : '';
    setDisplay(formatted);
    onChange(normalized);

    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const s = inputRef.current.value;
      let newPos = 0;
      let digitCount = 0;
      for (let i = 0; i < s.length; i++) {
        if (/\d/.test(s[i])) {
          if (digitCount === digitsBeforeCursor) { newPos = i; break; }
          digitCount++;
        }
        if (i === s.length - 1) newPos = s.length;
      }
      // Если курсор перед разделителем — сдвигаем за него вправо
      while (newPos < s.length && !/\d/.test(s[newPos]) && newPos > 0) newPos++;
      inputRef.current.setSelectionRange(newPos, newPos);
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