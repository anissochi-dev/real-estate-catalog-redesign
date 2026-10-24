import { useState } from 'react';
import Icon from '@/components/ui/icon';

interface Props {
  value?: string | null;
  wrap?: boolean;
}

export default function RealAddressToggle({ value, wrap }: Props) {
  const [open, setOpen] = useState(false);
  const text = (value || '').trim();
  if (!text) return null;

  if (wrap) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border text-brand-blue hover:bg-muted whitespace-nowrap"
        >
          <Icon name={open ? 'EyeOff' : 'Eye'} size={12} />
          {open ? 'Скрыть реальный адрес' : 'Показать реальный адрес'}
        </button>
        {open && <span className="text-xs text-foreground font-medium break-words">{text}</span>}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 ml-auto flex-shrink-0 min-w-0">
      {open && (
        <span className="text-xs text-foreground font-medium truncate max-w-[220px]" title={text}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-border text-brand-blue hover:bg-muted whitespace-nowrap"
      >
        <Icon name={open ? 'EyeOff' : 'Eye'} size={12} />
        {open ? 'Скрыть реальный адрес' : 'Показать реальный адрес'}
      </button>
    </span>
  );
}