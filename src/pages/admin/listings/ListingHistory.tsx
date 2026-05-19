import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

interface HistoryItem {
  id: number;
  listing_id: number;
  user_name: string;
  action: string;
  changes: Record<string, [unknown, unknown]> | null;
  created_at: string;
}

interface Stats {
  total_views: number;
  views_30d: number;
  views_7d: number;
  leads_total: number;
  leads_30d: number;
  daily: { stat_date: string; views_count: number; leads_count: number }[];
}

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  created: { label: 'Создан', icon: 'Plus', color: 'text-emerald-600 bg-emerald-50' },
  updated: { label: 'Изменён', icon: 'Pencil', color: 'text-blue-600 bg-blue-50' },
  archived: { label: 'Архивирован', icon: 'Archive', color: 'text-orange-600 bg-orange-50' },
  restored: { label: 'Восстановлен', icon: 'RotateCcw', color: 'text-violet-600 bg-violet-50' },
  photo_added: { label: 'Фото добавлено', icon: 'Image', color: 'text-sky-600 bg-sky-50' },
  photo_removed: { label: 'Фото удалено', icon: 'ImageOff', color: 'text-red-600 bg-red-50' },
};

function fmtDt(s: string) {
  return new Date(s).toLocaleString('ru', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

interface Props {
  listingId: number;
  listingTitle: string;
  onClose: () => void;
}

export default function ListingHistory({ listingId, listingTitle, onClose }: Props) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<'history' | 'stats'>('stats');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminApi.getListingHistory(listingId),
      adminApi.getListingStats(listingId),
    ]).then(([h, s]) => {
      setHistory(h.history || []);
      setStats(s);
    }).finally(() => setLoading(false));
  }, [listingId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="font-display font-700 text-base">{listingTitle}</div>
            <div className="text-xs text-muted-foreground mt-0.5">История и статистика</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex border-b border-border">
          {(['stats', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === t ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'stats' ? 'Статистика' : 'История изменений'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">Загрузка...</div>
          ) : tab === 'stats' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Просмотров всего" value={stats?.total_views ?? 0} icon="Eye" color="from-brand-blue to-brand-blue-dark" />
                <StatCard label="За 30 дней" value={stats?.views_30d ?? 0} icon="CalendarDays" color="from-sky-400 to-sky-600" />
                <StatCard label="Заявок всего" value={stats?.leads_total ?? 0} icon="Inbox" color="from-brand-orange to-orange-600" />
                <StatCard label="Заявок за 30 дней" value={stats?.leads_30d ?? 0} icon="TrendingUp" color="from-emerald-500 to-emerald-700" />
              </div>
              {stats?.daily && stats.daily.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">По дням (последние 30)</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {[...stats.daily].reverse().map(d => (
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
              {stats?.total_views === 0 && stats?.leads_total === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4">
                  Пока нет данных о просмотрах.<br />
                  <span className="text-xs">Статистика накапливается автоматически.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">История пуста</div>
              ) : (
                history.map(h => {
                  const meta = ACTION_LABELS[h.action] || { label: h.action, icon: 'Activity', color: 'text-slate-600 bg-slate-50' };
                  return (
                    <div key={h.id} className="flex gap-3 p-3 rounded-xl hover:bg-muted/30">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                        <Icon name={meta.icon} size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{meta.label}</span>
                          <span className="text-xs text-muted-foreground">{h.user_name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{fmtDt(h.created_at)}</span>
                        </div>
                        {h.changes && Object.keys(h.changes).length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                            {Object.entries(h.changes).slice(0, 5).map(([field, [oldV, newV]]) => (
                              <div key={field}>
                                <span className="font-medium">{field}:</span>{' '}
                                <span className="line-through opacity-60">{String(oldV)}</span>
                                {' → '}
                                <span>{String(newV)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${color} text-white`}>
      <Icon name={icon} size={18} className="mb-2 opacity-80" />
      <div className="text-2xl font-display font-700">{value}</div>
      <div className="text-xs opacity-90 mt-0.5">{label}</div>
    </div>
  );
}
