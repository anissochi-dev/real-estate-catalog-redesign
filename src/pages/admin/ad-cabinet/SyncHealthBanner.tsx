import Icon from '@/components/ui/icon';
import { StalePlatform } from './types';

function formatAgo(hoursAgo: number | null): string {
  if (hoursAgo === null) return 'никогда';
  if (hoursAgo < 48) return `${Math.round(hoursAgo)} ч. назад`;
  return `${Math.round(hoursAgo / 24)} дн. назад`;
}

/** Баннер здоровья автообновления — виден постоянно на дашборде рекламного
 * кабинета (в отличие от модалки при входе, которую можно закрыть и забыть),
 * пока проблема не устранена. Использует те же данные (action=sync_health),
 * что и всплывающее уведомление — один источник правды. */
export default function SyncHealthBanner({ stale }: { stale: StalePlatform[] }) {
  if (stale.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
      <Icon name="AlertTriangle" size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-800">
        <span className="font-semibold">
          {stale.length} площад{stale.length === 1 ? 'ка' : stale.length < 5 ? 'ки' : 'ок'} не обновля{stale.length === 1 ? 'лась' : 'лись'} более суток:
        </span>{' '}
        {stale.map((p, i) => (
          <span key={p.key}>
            {p.label} ({formatAgo(p.hours_ago)}){i < stale.length - 1 ? ', ' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
