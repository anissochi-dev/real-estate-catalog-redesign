import Icon from '@/components/ui/icon';
import { fmtDate } from './types';
import { InternalCardLead, HistoryRow, LEAD_STATUS } from './internalCardTypes';
import { Deal } from './radarTypes';
import RadarBlock from './RadarBlock';

export function RadarLeadsDealsRow({ leads, deals }: { leads: InternalCardLead[]; deals: Deal[] }) {
  return (
    <>
  {/* ── Строка 4: Заявки + CRM-сделки ── */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

    {/* Последние заявки */}
    <RadarBlock icon="Inbox" title={`Заявки (${leads.length})`}>
      {leads.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-3">Заявок по объекту нет</div>
      ) : (
        <div className="space-y-2">
          {leads.slice(0, 4).map(l => {
            const statusColors: Record<string, string> = {
              new: 'bg-emerald-100 text-emerald-700',
              in_progress: 'bg-amber-100 text-amber-700',
              done: 'bg-blue-100 text-blue-700',
              rejected: 'bg-red-100 text-red-700',
              pending: 'bg-orange-100 text-orange-700',
            };
            return (
              <div key={l.id} className="flex items-center gap-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
                  <Icon name="User" size={13} className="text-brand-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs truncate">{l.name}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDate(l.created_at)}</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${statusColors[l.status] || 'bg-muted text-muted-foreground'}`}>
                  {LEAD_STATUS[l.status] || l.status}
                </span>
              </div>
            );
          })}
          {leads.length > 4 && (
            <div className="text-xs text-muted-foreground text-center pt-1">
              + ещё {leads.length - 4} заявок — откройте вкладку «Заявки»
            </div>
          )}
        </div>
      )}
    </RadarBlock>

    {/* CRM-сделки */}
    <RadarBlock icon="Handshake" title={`Сделки CRM (${deals.length})`}>
      {deals.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-3 flex flex-col items-center gap-1">
          <Icon name="Handshake" size={20} className="opacity-30" />
          Сделок по объекту нет
        </div>
      ) : (
        <div className="space-y-2">
          {deals.slice(0, 4).map(d => (
            <div key={d.id} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.stage_color || '#94a3b8' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{d.title}</div>
                <div className="text-[10px] text-muted-foreground">{d.stage_name}</div>
              </div>
              {d.amount && (
                <span className="text-xs font-bold text-brand-blue shrink-0">
                  {(d.amount / 1_000_000).toFixed(1)} млн
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </RadarBlock>
  </div>
    </>
  );
}

export function RadarRecentChanges({ history }: { history: HistoryRow[] }) {
  return (
    <>
  {/* ── Строка 5: Последние изменения ── */}
  <RadarBlock icon="Clock" title="Последние изменения объекта">
    {history.length === 0 ? (
      <div className="text-sm text-muted-foreground text-center py-2">История пуста</div>
    ) : (
      <div className="space-y-2">
        {history.slice(0, 5).map(h => {
          const ACTION_CFG: Record<string, { label: string; icon: string; color: string }> = {
            created:       { label: 'Создан',        icon: 'Plus',       color: 'text-emerald-600 bg-emerald-50' },
            updated:       { label: 'Изменён',       icon: 'Pencil',     color: 'text-blue-600 bg-blue-50' },
            price_changed: { label: 'Цена',          icon: 'TrendingDown', color: 'text-amber-600 bg-amber-50' },
            status_changed:{ label: 'Статус',        icon: 'RefreshCw',  color: 'text-violet-600 bg-violet-50' },
            archived:      { label: 'Архивирован',   icon: 'Archive',    color: 'text-orange-600 bg-orange-50' },
            photo_added:   { label: 'Фото добавлено', icon: 'Image',     color: 'text-sky-600 bg-sky-50' },
          };
          const cfg = ACTION_CFG[h.action] || { label: h.action, icon: 'Activity', color: 'text-muted-foreground bg-muted' };
          const fields = h.changes ? Object.keys(h.changes as Record<string, unknown>).slice(0, 3) : [];
          return (
            <div key={h.id} className="flex items-start gap-2.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                <Icon name={cfg.icon} size={11} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold">{cfg.label}</span>
                  {fields.length > 0 && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {fields.join(', ')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {h.user_name || '—'} · {fmtDate(h.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </RadarBlock>
    </>
  );
}
