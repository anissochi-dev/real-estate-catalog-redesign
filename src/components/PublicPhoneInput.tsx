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
  const caretRef = useRef<number>(0);

  useEffect(() => {
    const formatted = value ? formatPhone(value) : '';
    setDisplay(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const selEnd = el.selectionEnd ?? el.value.length;
    // считаем сколько цифр было до курсора
    const digitsBeforeCaret = extractDigits(el.value.slice(0, selEnd)).length;

    const digits = extractDigits(el.value).slice(0, 10);
    const normalized = digits ? normalizePhone('+7' + digits) : '';
    const formatted = digits ? formatPhone('+7' + digits) : '';
    setDisplay(formatted);
    onChange(normalized);

    // восстанавливаем позицию курсора после ре-рендера
    caretRef.current = digitsBeforeCaret;
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const s = inputRef.current.value;
      let pos = 0;
      let count = 0;
      // ищем позицию в новой строке где будет столько же цифр до курсора
      while (pos < s.length && count < caretRef.current) {
        if (/\d/.test(s[pos])) count++;
        pos++;
      }
      inputRef.current.setSelectionRange(pos, pos);
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
