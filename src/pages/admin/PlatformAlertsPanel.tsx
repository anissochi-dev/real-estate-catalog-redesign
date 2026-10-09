import Icon from '@/components/ui/icon';
import type { FailingPlatform, StalePlatform } from './ad-cabinet/types';

interface Props {
  stale: StalePlatform[];
  failing: FailingPlatform[];
  onOpenAdCabinet: () => void;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtHours(h: number | null) {
  if (h === null) return 'ни разу не синхронизировалась';
  if (h < 48) return `${Math.round(h)} ч. без обновления`;
  return `${Math.round(h / 24)} дн. без обновления`;
}

export default function PlatformAlertsPanel({ stale, failing, onOpenAdCabinet }: Props) {
  const failingKeys = new Set(failing.map(f => f.key));
  const staleOnly = stale.filter(s => !failingKeys.has(s.key));

  if (failing.length === 0 && staleOnly.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Icon name="CheckCircle2" size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
        Все площадки синхронизируются в штатном режиме
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {failing.map(f => (
        <div key={`f-${f.key}`} className="border border-red-200 bg-red-50 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-red-800">
              <Icon name="AlertTriangle" size={16} />
              {f.label}: ошибка синхронизации
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">
              {f.errors} подряд
            </span>
          </div>
          {f.last_error && (
            <div className="text-xs text-red-700 break-words">{f.last_error}</div>
          )}
          <div className="text-xs text-red-600/80">
            Последняя попытка: {fmtDate(f.last_attempt)}
            {f.paused_until && <> · пауза до {fmtDate(f.paused_until)}</>}
          </div>
        </div>
      ))}

      {staleOnly.map(s => (
        <div key={`s-${s.key}`} className="border border-amber-200 bg-amber-50 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-800">
            <Icon name="Clock" size={16} />
            {s.label}: данные устарели
          </div>
          <div className="text-xs text-amber-700">
            {fmtHours(s.hours_ago)}{s.last_sync && <> · последняя: {fmtDate(s.last_sync)}</>}
          </div>
        </div>
      ))}

      <button
        onClick={onOpenAdCabinet}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
      >
        <Icon name="Megaphone" size={14} /> Открыть рекламный кабинет
      </button>
    </div>
  );
}
