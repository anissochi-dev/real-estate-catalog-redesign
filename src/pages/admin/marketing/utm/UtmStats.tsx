import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import { UtmLink, SourceStat, Campaign, TimelinePoint, SOURCE_ICONS, TRACKER_URL } from './utmTypes';

interface Props {
  links: UtmLink[];
  sources: SourceStat[];
  timeline: TimelinePoint[];
  campaigns: Campaign[];
  totalClicks: number;
  loadingData: boolean;
  copiedId: number | null;
  setCopiedId: (v: number | null) => void;
}

export default function UtmStats({
  links, sources, timeline, campaigns, totalClicks,
  loadingData, copiedId, setCopiedId,
}: Props) {

  const timelineMax = Math.max(...timeline.map(t => t.cnt), 1);
  const maxClicks   = Math.max(...sources.map(s => s.clicks_period), 1);

  const trackClick = async (link: UtmLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('Скопировано');
    } catch { toast.error('Не удалось скопировать'); return; }

    fetch(TRACKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_id: link.id }),
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: 'MousePointerClick', label: 'Кликов за период', value: totalClicks,       color: 'text-brand-blue bg-brand-blue/10' },
          { icon: 'Link',              label: 'Ссылок всего',      value: links.length,      color: 'text-violet-600 bg-violet-100' },
          { icon: 'Globe',             label: 'Источников',        value: sources.length,    color: 'text-emerald-600 bg-emerald-100' },
          { icon: 'Megaphone',         label: 'Кампаний',          value: campaigns.length,  color: 'text-amber-600 bg-amber-100' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-border p-4 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <div>
              <div className="text-2xl font-bold">{loadingData ? '—' : k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Динамика кликов по дням */}
      {timeline.length > 1 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="TrendingUp" size={15} className="text-brand-blue" />
            <span className="font-semibold text-sm">Динамика кликов</span>
          </div>
          <div className="flex items-end gap-0.5 h-20">
            {timeline.map((t, i) => (
              <div key={i} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full bg-brand-blue/30 hover:bg-brand-blue rounded-t-sm transition-all"
                  style={{ height: `${Math.max(4, Math.round(t.cnt / timelineMax * 100))}%` }}
                />
                <div className="absolute bottom-full mb-1 text-[10px] bg-foreground text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                  {t.day.slice(5)}: {t.cnt}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{timeline[0]?.day?.slice(5)}</span>
            <span>{timeline[timeline.length - 1]?.day?.slice(5)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* По источникам */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="BarChart3" size={15} className="text-brand-blue" />
            <span className="font-semibold text-sm">По источникам</span>
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
          ) : (
            <div className="space-y-3">
              {sources.map(s => (
                <div key={s.utm_source} className="flex items-center gap-3">
                  <div className="w-20 text-sm font-medium shrink-0 flex items-center gap-1.5">
                    <span>{SOURCE_ICONS[s.utm_source] || '🔗'}</span>
                    <span className="truncate text-xs">{s.utm_source}</span>
                  </div>
                  <div className="flex-1 bg-muted/40 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-brand-blue transition-all"
                      style={{ width: `${maxClicks > 0 ? Math.round(s.clicks_period / maxClicks * 100) : 0}%` }}
                    />
                  </div>
                  <div className="text-right shrink-0 w-20 text-xs">
                    <span className="font-bold">{s.clicks_period}</span>
                    <span className="text-muted-foreground"> кл.</span>
                    <div className="text-[10px] text-muted-foreground">{s.links_count} ссылок</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Топ кампаний */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="Megaphone" size={15} className="text-brand-blue" />
            <span className="font-semibold text-sm">Топ кампаний</span>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Нет данных</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c, i) => {
                const maxC = Math.max(...campaigns.map(x => x.clicks_period), 1);
                return (
                  <div key={c.utm_campaign} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{c.utm_campaign}</div>
                      <div className="h-1.5 bg-muted/40 rounded-full mt-1">
                        <div className="h-1.5 rounded-full bg-amber-400 transition-all"
                          style={{ width: `${Math.round(c.clicks_period / maxC * 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold shrink-0 text-brand-blue">{c.clicks_period}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Топ ссылок */}
      {links.some(l => l.clicks_period > 0) && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="MousePointerClick" size={15} className="text-brand-blue" />
            <span className="font-semibold text-sm">Топ ссылок за период</span>
          </div>
          <div className="space-y-2">
            {[...links].sort((a, b) => b.clicks_period - a.clicks_period)
              .filter(l => l.clicks_period > 0).slice(0, 10)
              .map((link, i) => (
                <div key={link.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{link.label || link.url}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {SOURCE_ICONS[link.utm_source] || ''} {link.utm_source}
                      {link.utm_campaign ? ` · ${link.utm_campaign}` : ''}
                      {link.listing_title ? ` · ${link.listing_title}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-brand-blue">{link.clicks_period}</div>
                    <div className="text-[10px] text-muted-foreground">{link.clicks_total} всего</div>
                  </div>
                  <button onClick={() => trackClick(link)}
                    className="p-1.5 rounded-lg hover:bg-muted/60 transition text-muted-foreground hover:text-brand-blue shrink-0">
                    <Icon name={copiedId === link.id ? 'Check' : 'Copy'} size={13} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

    </div>
  );
}
