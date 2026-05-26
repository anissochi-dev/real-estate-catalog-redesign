import { useState, useEffect } from 'react';
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

  useEffect(() => {
    setDisplay(value ? formatPhone(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = extractDigits(e.target.value).slice(0, 10);
    const normalized = digits ? normalizePhone('+7' + digits) : '';
    setDisplay(digits ? formatPhone('+7' + digits) : '');
    onChange(normalized);
  };

  return (
    <input
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
