import type { PhoneFlag } from '@/hooks/usePhoneFlag';

interface Props {
  flag: PhoneFlag;
  size?: 'sm' | 'md';
}

const FLAG_CONFIG = {
  bad_owner: {
    dot: 'bg-red-500',
    bg: 'bg-red-50 border-red-200 text-red-700',
    label: 'Плохой собственник',
  },
  competitor: {
    dot: 'bg-orange-400',
    bg: 'bg-orange-50 border-orange-200 text-orange-700',
    label: 'Брокер-конкурент',
  },
};

export default function PhoneFlagBadge({ flag, size = 'md' }: Props) {
  const cfg = FLAG_CONFIG[flag.flag_type] || FLAG_CONFIG.bad_owner;

  if (size === 'sm') {
    return (
      <span
        title={[cfg.label, flag.comment].filter(Boolean).join(' — ')}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] font-medium ${cfg.bg}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-sm ${cfg.bg}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${cfg.dot}`} />
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{cfg.label}</div>
        {flag.comment && (
          <div className="text-xs opacity-80 mt-0.5 leading-snug">{flag.comment}</div>
        )}
        {flag.created_by_name && (
          <div className="text-[11px] opacity-60 mt-0.5">Отметил: {flag.created_by_name}</div>
        )}
      </div>
    </div>
  );
}
