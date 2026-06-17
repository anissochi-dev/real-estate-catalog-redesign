import { useState } from 'react';
import Icon from '@/components/ui/icon';

export const Sec = ({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border mt-4 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <Icon name={icon} size={13} className="text-brand-blue shrink-0" />
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest flex-1">{title}</span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground" />
      </button>
      {open && children}
    </div>
  );
};

export const Pill = ({ label, green }: { label: string; green: boolean }) => (
  <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg ${
    green ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
  }`}>
    <Icon name={green ? 'CheckCircle2' : 'XCircle'} size={12} />
    {label}
  </div>
);
