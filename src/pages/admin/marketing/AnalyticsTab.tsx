import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import {
  MarketingStats, CATEGORY_LABELS, DEAL_LABELS, STATUS_LABELS, SOURCE_COLORS, fmtMoney,
} from './shared';

// ── Вспомогательные UI-компоненты ─────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = 'blue' }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-brand-blue/10 text-brand-blue',
    green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-brand-blue mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function HBar({ items, max }: { items: { label: string; value: number; colorClass?: string }[]; max: number }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-28 text-xs text-muted-foreground truncate flex-shrink-0">{item.label}</div>
          <div className="flex-1 bg-muted/40 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${item.colorClass || 'bg-brand-blue'}`}
              style={{ width: max > 0 ? `${Math.round((item.value / max) * 100)}%` : '0%' }}
            />
          </div>
          <div className="w-8 text-xs font-semibold text-right">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Вкладка: Аналитика ────────────────────────────────────────────────────────

export default function AnalyticsTab() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await req('site_health&action=marketing_stats');
      if (d.error) { toast.error(d.error); return; }
      setStats(d);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Icon name="Loader2" size={20} className="animate-spin" /> Загрузка аналитики…
    </div>
  );

  if (!stats) return (
    <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
      <Icon name="BarChart3" size={32} className="opacity-30" />
      <p className="text-sm">Нет данных</p>
      <button onClick={load} className="text-brand-blue text-sm hover:underline">Загрузить</button>
    </div>
  );

  const { totals, leads_by_source, leads_by_status, top_listings, listings_stats, deals_by_source, views_by_source } = stats;

  const maxSource = Math.max(...leads_by_source.map(s => s.cnt), 1);
  const maxStatus = Math.max(...leads_by_status.map(s => s.cnt), 1);
  const totalViews = Object.values(views_by_source).reduce((acc, evts) =>
    acc + Object.values(evts).reduce((a, v) => a + v, 0), 0);

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="Inbox" label="Всего заявок" value={totals.total_leads} sub={`+${totals.leads_30d} за 30 дней`} color="blue" />
        <StatCard icon="Eye" label="Просмотров объектов" value={totals.total_views} color="purple" />
        <StatCard icon="Building2" label="Активных объектов" value={totals.active_listings} color="green" />
        <StatCard icon="Handshake" label="Сделок в CRM" value={totals.total_deals} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Лиды по источникам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Funnel" size={16} className="text-brand-blue" /> Лиды по источникам
          </h3>
          {leads_by_source.length === 0
            ? <p className="text-sm text-muted-foreground">Нет данных</p>
            : <HBar
                max={maxSource}
                items={leads_by_source.map(s => ({ label: s.source, value: s.cnt }))}
              />
          }
        </div>

        {/* Лиды по статусам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="CircleDot" size={16} className="text-brand-blue" /> Лиды по статусам
          </h3>
          {leads_by_status.length === 0
            ? <p className="text-sm text-muted-foreground">Нет данных</p>
            : <HBar
                max={maxStatus}
                items={leads_by_status.map(s => ({
                  label: STATUS_LABELS[s.status] || s.status,
                  value: s.cnt,
                  colorClass: s.status === 'closed' ? 'bg-emerald-500' : s.status === 'new' ? 'bg-brand-blue' : 'bg-amber-400',
                }))}
              />
          }
        </div>

        {/* Просмотры по площадкам */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Globe" size={16} className="text-brand-blue" /> Просмотры по площадкам
          </h3>
          {totalViews === 0
            ? <p className="text-sm text-muted-foreground">Нет данных о просмотрах</p>
            : (
              <div className="space-y-2">
                {Object.entries(views_by_source).map(([src, evts]) => {
                  const total = Object.values(evts).reduce((a, v) => a + v, 0);
                  const colorClass = SOURCE_COLORS[src] || 'bg-slate-100 text-slate-600';
                  return (
                    <div key={src} className="flex items-center gap-3 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${colorClass}`}>{src}</span>
                      <div className="flex-1 bg-muted/40 rounded-full h-2">
                        <div className="h-2 rounded-full bg-brand-blue/70 transition-all"
                          style={{ width: `${Math.round((total / totalViews) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold w-8 text-right">{total}</span>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Сделки по источникам (CRM) */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="Handshake" size={16} className="text-brand-blue" /> Сделки CRM по источникам
          </h3>
          {deals_by_source.length === 0
            ? <p className="text-sm text-muted-foreground">Нет сделок</p>
            : (
              <div className="space-y-2">
                {deals_by_source.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[d.source] || 'bg-slate-100 text-slate-600'}`}>
                      {d.source}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">{d.cnt} сделок</span>
                      <span className="font-semibold text-xs">{fmtMoney(Number(d.total_amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Топ объектов */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Icon name="TrendingUp" size={16} className="text-brand-blue" /> Топ объектов по просмотрам
        </h3>
        {top_listings.length === 0
          ? <p className="text-sm text-muted-foreground">Нет данных</p>
          : (
            <div className="grid gap-2">
              {top_listings.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[l.category] || l.category} · {DEAL_LABELS[l.deal] || l.deal} · {fmtMoney(l.price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-semibold text-brand-blue flex-shrink-0">
                    <Icon name="Eye" size={13} /> {l.views_site}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Статистика по категориям */}
      {listings_stats.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Icon name="LayoutGrid" size={16} className="text-brand-blue" /> Объекты по категориям
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 font-medium">Категория</th>
                  <th className="text-right pb-2 font-medium">Объектов</th>
                  <th className="text-right pb-2 font-medium">Просмотров</th>
                  <th className="text-right pb-2 font-medium">В среднем</th>
                </tr>
              </thead>
              <tbody>
                {listings_stats.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium">
                      {CATEGORY_LABELS[row.category] || row.category}
                      <span className="ml-1 text-xs text-muted-foreground">{DEAL_LABELS[row.deal] || row.deal}</span>
                    </td>
                    <td className="py-2 text-right">{row.cnt}</td>
                    <td className="py-2 text-right font-semibold">{row.total_views ?? 0}</td>
                    <td className="py-2 text-right text-muted-foreground">{Number(row.avg_views || 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition">
          <Icon name="RefreshCw" size={13} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>
    </div>
  );
}
