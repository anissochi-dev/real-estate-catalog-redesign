import Icon from '@/components/ui/icon';
import PlatformIcon from '@/components/admin/PlatformIcon';
import { OldStats, MultiStats, SOURCES, EVENT_LABELS_FALLBACK } from './listingHistoryUtils';

interface SummaryProps {
  oldStats: OldStats | null;
  multiStats: MultiStats | null;
  totalViews: number;
  totalCalls: number;
  totalLeads: number;
}

export function ListingHistorySummaryTab({ oldStats, multiStats, totalViews, totalCalls, totalLeads }: SummaryProps) {
  return (
    <div className="space-y-4">
      {/* Сводные карточки */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Просмотров всего" value={totalViews} icon="Eye" color="from-brand-blue to-indigo-600" />
        <StatCard label="Наш сайт" value={multiStats?.views_site || oldStats?.total_views || 0} icon="Monitor" color="from-sky-500 to-sky-700" />
        <StatCard label="Звонков" value={totalCalls} icon="Phone" color="from-emerald-500 to-emerald-700" />
        <StatCard label="Заявок" value={totalLeads} icon="Inbox" color="from-brand-orange to-orange-600" />
      </div>

      {/* Просмотры по дням (старая статистика сайта) */}
      {oldStats?.daily && oldStats.daily.length > 0 && (
        <div className="bg-muted/30 rounded-xl p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Просмотры на сайте по дням</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {[...oldStats.daily].reverse().map(d => (
              <div key={d.stat_date} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                <span className="text-muted-foreground">{d.stat_date}</span>
                <div className="flex gap-3">
                  <span><Icon name="Eye" size={11} className="inline mr-0.5" />{d.views_count}</span>
                  <span><Icon name="Inbox" size={11} className="inline mr-0.5" />{d.leads_count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalViews === 0 && totalLeads === 0 && (
        <div className="text-center text-muted-foreground text-sm py-6">
          Пока нет данных.<br />
          <span className="text-xs">Просмотры на сайте накапливаются автоматически. Данные с площадок вводите вручную.</span>
        </div>
      )}
    </div>
  );
}

interface PlatformsProps {
  oldStats: OldStats | null;
  multiStats: MultiStats | null;
  bySource: Record<string, Record<string, number>>;
}

export function ListingHistoryPlatformsTab({ oldStats, multiStats, bySource }: PlatformsProps) {
  return (
    <div className="space-y-3">
      {/* Наш сайт */}
      <div className="border border-brand-blue/20 rounded-xl p-4 bg-brand-blue/[0.03]">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="Monitor" size={16} className="text-brand-blue" />
          <span className="font-semibold text-sm">Наш сайт</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Просмотры" value={multiStats?.views_site || oldStats?.total_views || 0} />
          <MiniStat label="Заявки" value={oldStats?.leads_total || 0} />
        </div>
      </div>

      {/* Внешние площадки */}
      {SOURCES.map(src => {
        const data = bySource[src.value] || {};
        const hasData = Object.values(data).some(v => v > 0);
        return (
          <div key={src.value} className={`border rounded-xl p-4 ${hasData ? 'border-border' : 'border-dashed border-border opacity-60'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <PlatformIcon platform={src.value} icon={src.icon} size={15} className={src.color} />
                <span className="font-semibold text-sm">{src.label}</span>
              </div>
              {!hasData && <span className="text-[11px] text-muted-foreground">нет данных</span>}
            </div>
            {hasData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(data).map(([ev, val]) => (
                  <MiniStat key={ev} label={multiStats?.event_labels?.[ev] || EVENT_LABELS_FALLBACK[ev] || ev} value={val} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(bySource).length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-6">
          Данных с площадок нет.<br />
          <span className="text-xs">Добавьте их вручную на вкладке «Добавить данные»</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`rounded-xl p-3 bg-gradient-to-br ${color} text-white`}>
      <Icon name={icon} size={16} className="mb-1.5 opacity-80" />
      <div className="text-2xl font-display font-700">{value}</div>
      <div className="text-[11px] opacity-90 mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <div className="text-[10px] text-muted-foreground leading-none">{label}</div>
      <div className="font-display font-700 text-base mt-0.5">{value}</div>
    </div>
  );
}
