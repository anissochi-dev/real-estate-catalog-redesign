import Icon from '@/components/ui/icon';
import { StalePlatform } from './types';

interface Props {
  stale: StalePlatform[];
  onClose: () => void;
  onOpenAdCabinet: () => void;
}

function formatAgo(hoursAgo: number | null): string {
  if (hoursAgo === null) return 'ни разу не обновлялась';
  if (hoursAgo < 48) return `обновлялась ${Math.round(hoursAgo)} ч. назад`;
  return `обновлялась ${Math.round(hoursAgo / 24)} дн. назад`;
}

export default function SyncHealthModal({ stale, onClose, onOpenAdCabinet }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="AlertTriangle" size={18} className="text-amber-500" />
            <span className="font-display font-700 text-base">Площадки давно не обновлялись</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground mb-3">
            Автоматическая синхронизация не проходила больше суток — данные на этих площадках могут быть устаревшими:
          </p>
          {stale.map(p => (
            <div key={p.key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-sm font-semibold text-foreground">{p.label}</span>
              <span className="text-xs text-amber-700">{formatAgo(p.hours_ago)}</span>
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition"
          >
            Закрыть
          </button>
          <button
            onClick={() => { onOpenAdCabinet(); onClose(); }}
            className="flex-1 px-3 py-2.5 rounded-xl bg-brand-blue text-white text-sm font-semibold hover:opacity-90 transition"
          >
            Перейти в рекламный кабинет
          </button>
        </div>
      </div>
    </div>
  );
}
