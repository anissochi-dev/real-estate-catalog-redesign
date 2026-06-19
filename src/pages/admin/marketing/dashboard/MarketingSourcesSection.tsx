import Icon from '@/components/ui/icon';
import { MarketingStats, CATEGORY_LABELS, DEAL_LABELS, SOURCE_COLORS, fmtMoney } from '../shared';

function MiniBar({ value, max, cls = 'bg-brand-blue' }: { value: number; max: number; cls?: string }) {
  return (
    <div className="flex-1 bg-muted/40 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${cls}`} style={{ width: max > 0 ? `${Math.min(100, Math.round(value / max * 100))}%` : '0%' }} />
    </div>
  );
}

function SectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon name={icon} size={15} className="text-brand-blue" />
      <span className="font-semibold text-sm">{title}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

interface Props {
  stats: MarketingStats;
  totalViews: number;
  maxSource: number;
}

export default function MarketingSourcesSection({ stats, totalViews, maxSource }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Заявки по источникам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <SectionHeader icon="Funnel" title="Заявки по источникам" count={stats.leads_by_source.length} />
          <div className="space-y-3">
            {stats.leads_by_source.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${SOURCE_COLORS[s.source] || 'bg-muted text-muted-foreground'}`}>
                  {s.source}
                </div>
                <MiniBar value={s.cnt} max={maxSource} />
                <span className="text-sm font-bold w-8 text-right">{s.cnt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Просмотры по площадкам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <SectionHeader icon="Globe" title="Просмотры по площадкам" />
          {totalViews === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.views_by_source ?? {}).map(([src, evts]) => {
                const total = evts && typeof evts === 'object' ? Object.values(evts as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0) : (Number(evts) || 0);
                return (
                  <div key={src} className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${SOURCE_COLORS[src] || 'bg-muted text-muted-foreground'}`}>
                      {src}
                    </span>
                    <MiniBar value={total} max={totalViews} cls="bg-purple-500" />
                    <span className="text-sm font-bold w-10 text-right">{total.toLocaleString('ru')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Распределение бюджетов клиентов */}
        <div className="bg-white rounded-2xl border border-border p-4 md:col-span-2">
          <SectionHeader icon="Banknote" title="Распределение бюджетов клиентов" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
            {(stats.leads_by_budget ?? []).map((b, i) => {
              const maxB = Math.max(...(stats.leads_by_budget ?? []).map(x => x.cnt), 1);
              const pct = Math.round(b.cnt / maxB * 100);
              const colors = ['bg-emerald-500', 'bg-brand-blue', 'bg-amber-400', 'bg-purple-500'];
              return (
                <div key={i} className="bg-muted/30 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold">{b.cnt}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{b.bucket}</div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full">
                    <div className={`h-1.5 rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Топ объектов по просмотрам */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <SectionHeader icon="TrendingUp" title="Топ объектов по просмотрам" count={stats.top_listings.length} />
        <div className="space-y-3">
          {stats.top_listings.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{l.title}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                  <span>{CATEGORY_LABELS[l.category] || l.category}</span>
                  {l.district && <span>· {l.district}</span>}
                  <span>· {fmtMoney(l.price)}</span>
                  {l.leads_count !== undefined && l.leads_count > 0 && (
                    <span className="text-brand-blue font-medium">· {l.leads_count} заявок</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-purple-600 flex-shrink-0">
                <Icon name="Eye" size={12} /> {l.views_site}
              </div>
            </div>
          ))}
          {stats.top_listings.length === 0 && <p className="text-sm text-muted-foreground">Нет данных о просмотрах</p>}
        </div>
      </div>

      {/* Статистика по категориям */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <SectionHeader icon="BarChart3" title="Статистика по категориям" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs text-muted-foreground font-medium">Категория</th>
                <th className="text-left py-2 text-xs text-muted-foreground font-medium">Тип</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Объектов</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Просмотров</th>
                <th className="text-right py-2 text-xs text-muted-foreground font-medium">Ср./объект</th>
              </tr>
            </thead>
            <tbody>
              {stats.listings_stats.slice(0, 12).map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 text-xs font-medium">{CATEGORY_LABELS[r.category] || r.category}</td>
                  <td className="py-2 text-xs text-muted-foreground">{DEAL_LABELS[r.deal] || r.deal}</td>
                  <td className="py-2 text-right text-xs">{r.cnt}</td>
                  <td className="py-2 text-right text-xs font-semibold">{r.total_views?.toLocaleString('ru') ?? 0}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">{r.avg_views ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
