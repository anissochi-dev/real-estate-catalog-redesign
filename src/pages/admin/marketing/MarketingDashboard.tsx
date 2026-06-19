import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import {
  MarketingStats, CATEGORY_LABELS, DEAL_LABELS, STATUS_LABELS,
  SOURCE_COLORS, fmtMoney,
} from './shared';

const SMART_BUDGET_URL = 'https://functions.poehali.dev/3e599d66-bb63-498f-bf23-4069c3a06660';

type Period = '7' | '30' | '90' | 'all';

interface BudgetItem {
  id: number; title: string; category: string; district: string;
  days_on_market: number; views_total: number; leads_count: number;
  conversion: number; priority: 'high' | 'medium' | 'low';
  budget: number; channels: { name: string; color: string; budget: number }[];
}
interface BudgetSummary {
  total_objects: number; priority_high: number; priority_medium: number;
  priority_low: number; total_budget_recommended: number;
}

const PRIORITY_CFG = {
  high:   { label: 'Срочно', dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',       icon: 'AlertCircle' },
  medium: { label: 'Внимание', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'TrendingDown' },
  low:    { label: 'Норма',   dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'CheckCircle2' },
};

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
  { value: 'all', label: 'Всё время' },
];

function MiniBar({ value, max, cls = 'bg-brand-blue' }: { value: number; max: number; cls?: string }) {
  return (
    <div className="flex-1 bg-muted/40 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full ${cls}`} style={{ width: max > 0 ? `${Math.min(100, Math.round(value / max * 100))}%` : '0%' }} />
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color = 'blue', trend }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string; trend?: number;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-brand-blue/10 text-brand-blue',
    green: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    rose: 'bg-rose-100 text-rose-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-border p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon name={icon} size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</div>
        {sub && <div className="text-xs text-brand-blue mt-1 font-medium">{sub}</div>}
        {trend !== undefined && (
          <div className={`text-xs font-semibold mt-1 flex items-center gap-0.5 ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            <Icon name={trend >= 0 ? 'TrendingUp' : 'TrendingDown'} size={11} />
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
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

function exportCSV(stats: MarketingStats) {
  const rows: string[] = ['Источник,Заявок'];
  stats.leads_by_source.forEach(r => rows.push(`"${r.source}",${r.cnt}`));
  rows.push('');
  rows.push('Статус,Заявок');
  stats.leads_by_status.forEach(r => rows.push(`"${STATUS_LABELS[r.status] || r.status}",${r.cnt}`));
  rows.push('');
  rows.push('Объект,Категория,Просмотров,Цена');
  stats.top_listings.forEach(l => rows.push(`"${l.title}","${CATEGORY_LABELS[l.category] || l.category}",${l.views_site},${l.price}`));

  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `marketing_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

export default function MarketingDashboard() {
  const [stats, setStats] = useState<MarketingStats | null>(null);
  const [budget, setBudget] = useState<{ items: BudgetItem[]; summary: BudgetSummary } | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [loading, setLoading] = useState(false);
  const [budgetFilter, setBudgetFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'sources' | 'objects' | 'budget'>('overview');

  const loadAll = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [statsData, budgetData] = await Promise.all([
        req(`site_health&action=marketing_stats&period=${p}`),
        fetch(SMART_BUDGET_URL).then(r => r.json()).catch(() => null),
      ]);
      if (statsData && !statsData.error) setStats({
        ...statsData,
        leads_by_source:  Array.isArray(statsData.leads_by_source)  ? statsData.leads_by_source  : [],
        leads_by_status:  Array.isArray(statsData.leads_by_status)  ? statsData.leads_by_status  : [],
        leads_timeline:   Array.isArray(statsData.leads_timeline)   ? statsData.leads_timeline   : [],
        leads_by_budget:  Array.isArray(statsData.leads_by_budget)  ? statsData.leads_by_budget  : [],
        top_listings:     Array.isArray(statsData.top_listings)     ? statsData.top_listings     : [],
        listings_stats:   Array.isArray(statsData.listings_stats)   ? statsData.listings_stats   : [],
        deals_by_source:  Array.isArray(statsData.deals_by_source)  ? statsData.deals_by_source  : [],
        views_by_source:  statsData.views_by_source && typeof statsData.views_by_source === 'object' ? statsData.views_by_source : {},
      });
      if (budgetData && !budgetData.error) setBudget(budgetData);
    } catch {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(period); }, [period, loadAll]);

  const totalViews = (() => {
    const vbs = stats?.views_by_source;
    if (!vbs || typeof vbs !== 'object') return 0;
    return Object.values(vbs).reduce((acc, evts) => {
      if (!evts || typeof evts !== 'object') return acc + (Number(evts) || 0);
      return acc + Object.values(evts as Record<string, number>).reduce((a, v) => a + (Number(v) || 0), 0);
    }, 0);
  })();

  const highPriority = budget?.items.filter(i => i.priority === 'high') ?? [];
  const filteredBudget = budget?.items.filter(i =>
    budgetFilter === 'all' ? true : i.priority === budgetFilter
  ) ?? [];

  const maxSource = Math.max(...(stats?.leads_by_source.map(s => s.cnt) ?? [1]), 1);
  const maxStatus = Math.max(...(stats?.leads_by_status.map(s => s.cnt) ?? [1]), 1);

  return (
    <div className="space-y-4">

      {/* ── Шапка пульта ── */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="LayoutDashboard" size={20} className="text-brand-blue" />
              Пульт маркетолога
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Аналитика, спрос и умный бюджет в одном месте
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Фильтр периода */}
            <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
              {PERIOD_OPTS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    period === opt.value ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Кнопки */}
            {stats && (
              <button
                onClick={() => exportCSV(stats)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition"
                title="Выгрузить в CSV"
              >
                <Icon name="Download" size={13} /> CSV
              </button>
            )}
            <button
              onClick={() => loadAll(period)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
            >
              <Icon name="RefreshCw" size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Загрузка…' : 'Обновить'}
            </button>
          </div>
        </div>

        {/* Навигация по секциям */}
        <div className="flex gap-1 mt-4 overflow-x-auto scrollbar-hide">
          {([
            { id: 'overview', icon: 'BarChart3', label: 'Обзор' },
            { id: 'sources', icon: 'Funnel', label: 'Источники' },
            { id: 'objects', icon: 'Building2', label: 'Объекты' },
            { id: 'budget', icon: 'Wallet', label: `Бюджет${highPriority.length > 0 ? ` (${highPriority.length} срочно)` : ''}` },
          ] as const).map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
                activeSection === s.id
                  ? 'bg-brand-blue text-white'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted/70'
              } ${s.id === 'budget' && highPriority.length > 0 && activeSection !== 'budget' ? 'ring-2 ring-red-300' : ''}`}
            >
              <Icon name={s.icon} size={13} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin" /> Загружаю данные…
        </div>
      )}

      {stats && (
        <>
          {/* ── СЕКЦИЯ: ОБЗОР ── */}
          {activeSection === 'overview' && (
            <div className="space-y-4">

              {/* Предупреждение если есть срочные объекты */}
              {highPriority.length > 0 && (
                <div
                  onClick={() => setActiveSection('budget')}
                  className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-red-100 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <Icon name="AlertCircle" size={16} className="text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-red-800">
                      {highPriority.length} {highPriority.length === 1 ? 'объект требует' : 'объекта требуют'} срочного продвижения
                    </div>
                    <div className="text-xs text-red-600 mt-0.5">
                      {highPriority.slice(0, 2).map(i => i.title).join(', ')}{highPriority.length > 2 ? ` и ещё ${highPriority.length - 2}` : ''}
                    </div>
                  </div>
                  <Icon name="ArrowRight" size={16} className="text-red-500 shrink-0" />
                </div>
              )}

              {/* KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiCard
                  icon="Inbox" label="Заявок" color="blue"
                  value={stats.totals.total_leads}
                  sub={`+${stats.totals.leads_30d} за 30 дн.`}
                />
                <KpiCard
                  icon="Eye" label="Просмотров" color="purple"
                  value={totalViews.toLocaleString('ru')}
                />
                <KpiCard
                  icon="Building2" label="Объектов" color="green"
                  value={stats.totals.active_listings}
                  sub="активных"
                />
                <KpiCard
                  icon="Handshake" label="Сделок" color="amber"
                  value={stats.totals.total_deals}
                />
                {stats.totals.won_deals !== undefined && (
                  <KpiCard
                    icon="Trophy" label="Выиграно" color="green"
                    value={stats.totals.won_deals}
                  />
                )}
                {stats.totals.total_commission !== undefined && stats.totals.total_commission > 0 && (
                  <KpiCard
                    icon="BadgeRuble" label="Комиссия" color="rose"
                    value={fmtMoney(stats.totals.total_commission)}
                  />
                )}
              </div>

              {/* Динамика лидов по дням — мини-график */}
              {stats.leads_timeline.length > 1 && (
                <div className="bg-white rounded-2xl border border-border p-4">
                  <SectionHeader icon="TrendingUp" title={`Динамика заявок — ${stats.period || '30 дней'}`} />
                  <div className="flex items-end gap-1 h-16">
                    {(() => {
                      const maxVal = Math.max(...stats.leads_timeline.map(d => d.cnt), 1);
                      return stats.leads_timeline.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div
                            className="w-full rounded-sm bg-brand-blue/70 hover:bg-brand-blue transition-all cursor-default"
                            style={{ height: `${Math.max(4, Math.round((d.cnt / maxVal) * 56))}px` }}
                          />
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-foreground text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                            {d.day.slice(5)}: {d.cnt}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* 2 колонки: источники + бюджеты */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Заявки по источникам */}
                <div className="bg-white rounded-2xl border border-border p-4">
                  <SectionHeader icon="Funnel" title="Заявки по источникам" />
                  <div className="space-y-2.5">
                    {stats.leads_by_source.slice(0, 6).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${SOURCE_COLORS[s.source] || 'bg-muted text-muted-foreground'}`}>
                          {s.source}
                        </div>
                        <MiniBar value={s.cnt} max={maxSource} />
                        <span className="text-xs font-bold w-6 text-right">{s.cnt}</span>
                      </div>
                    ))}
                    {stats.leads_by_source.length === 0 && <p className="text-sm text-muted-foreground">Нет данных</p>}
                  </div>
                </div>

                {/* Бюджеты клиентов */}
                <div className="bg-white rounded-2xl border border-border p-4">
                  <SectionHeader icon="Banknote" title="Бюджеты клиентов" />
                  <div className="space-y-2.5">
                    {(stats.leads_by_budget ?? []).map((b, i) => {
                      const maxB = Math.max(...(stats.leads_by_budget ?? []).map(x => x.cnt), 1);
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div className="text-xs text-muted-foreground w-24 flex-shrink-0 truncate">{b.bucket}</div>
                          <MiniBar value={b.cnt} max={maxB} cls="bg-amber-400" />
                          <span className="text-xs font-bold w-6 text-right">{b.cnt}</span>
                        </div>
                      );
                    })}
                    {(!stats.leads_by_budget || stats.leads_by_budget.length === 0) && (
                      <p className="text-sm text-muted-foreground">Нет данных о бюджетах</p>
                    )}
                  </div>
                </div>

                {/* Статусы заявок */}
                <div className="bg-white rounded-2xl border border-border p-4">
                  <SectionHeader icon="CircleDot" title="Статусы заявок" />
                  <div className="space-y-2.5">
                    {stats.leads_by_status.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div className="text-xs text-muted-foreground w-24 flex-shrink-0">{STATUS_LABELS[s.status] || s.status}</div>
                        <MiniBar value={s.cnt} max={maxStatus} cls={
                          s.status === 'new' ? 'bg-emerald-500' :
                          s.status === 'in_progress' ? 'bg-amber-400' :
                          s.status === 'done' ? 'bg-blue-500' :
                          s.status === 'rejected' ? 'bg-red-400' : 'bg-muted-foreground'
                        } />
                        <span className="text-xs font-bold w-6 text-right">{s.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Сделки CRM */}
                <div className="bg-white rounded-2xl border border-border p-4">
                  <SectionHeader icon="Handshake" title="Сделки CRM" />
                  {stats.deals_by_source.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Нет сделок за период</p>
                  ) : (
                    <div className="space-y-2">
                      {stats.deals_by_source.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${SOURCE_COLORS[d.source] || 'bg-muted text-muted-foreground'}`}>
                            {d.source}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">{d.cnt} сделок</span>
                            <span className="font-bold">{fmtMoney(Number(d.total_amount))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ── СЕКЦИЯ: ИСТОЧНИКИ ── */}
          {activeSection === 'sources' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

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
            </div>
          )}

          {/* ── СЕКЦИЯ: ОБЪЕКТЫ ── */}
          {activeSection === 'objects' && (
            <div className="space-y-4">

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
          )}

          {/* ── СЕКЦИЯ: УМНЫЙ БЮДЖЕТ ── */}
          {activeSection === 'budget' && (
            <div className="space-y-4">

              {budget ? (
                <>
                  {/* Сводка */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-2xl border border-border p-4">
                      <div className="text-2xl font-bold">{budget.summary.total_objects}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Активных объектов</div>
                    </div>
                    <div className="bg-red-50 rounded-2xl border border-red-200 p-4">
                      <div className="text-2xl font-bold text-red-600">{budget.summary.priority_high}</div>
                      <div className="text-xs text-red-500 mt-0.5">Срочно продвигать</div>
                    </div>
                    <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                      <div className="text-2xl font-bold text-amber-600">{budget.summary.priority_medium}</div>
                      <div className="text-xs text-amber-500 mt-0.5">Нужно внимание</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-border p-4">
                      <div className="text-2xl font-bold text-brand-blue">{fmtMoney(budget.summary.total_budget_recommended)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Бюджет/мес</div>
                    </div>
                  </div>

                  {/* Фильтры */}
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { id: 'all', label: 'Все', count: budget.items.length },
                      { id: 'high', label: 'Срочно', count: budget.summary.priority_high },
                      { id: 'medium', label: 'Внимание', count: budget.summary.priority_medium },
                    ] as const).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setBudgetFilter(f.id)}
                        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition font-semibold ${
                          budgetFilter === f.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white border-border text-foreground/70 hover:bg-muted/50'
                        }`}
                      >
                        {f.label}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${budgetFilter === f.id ? 'bg-white/20' : 'bg-muted'}`}>
                          {f.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Список объектов */}
                  <div className="space-y-2">
                    {filteredBudget.map(item => {
                      const p = PRIORITY_CFG[item.priority];
                      const isOpen = expandedId === item.id;
                      return (
                        <div key={item.id} className="bg-white rounded-2xl border border-border overflow-hidden">
                          <div
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition"
                            onClick={() => setExpandedId(isOpen ? null : item.id)}
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">{item.title}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                <span>{item.category}</span>
                                {item.district && <span>· {item.district}</span>}
                              </div>
                            </div>
                            <div className="hidden sm:flex items-center gap-4 text-right flex-shrink-0">
                              <div>
                                <div className="text-xs font-semibold">{item.days_on_market} дн.</div>
                                <div className="text-[10px] text-muted-foreground">экспозиция</div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold">{item.views_total}</div>
                                <div className="text-[10px] text-muted-foreground">просмотров</div>
                              </div>
                              <div>
                                <div className="text-xs font-bold text-brand-blue">{fmtMoney(item.budget)}</div>
                                <div className="text-[10px] text-muted-foreground">бюджет/мес</div>
                              </div>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.badge} hidden sm:inline-flex items-center gap-1`}>
                              <Icon name={p.icon} size={10} /> {p.label}
                            </span>
                            <Icon name={isOpen ? 'ChevronUp' : 'ChevronDown'} size={14} className="text-muted-foreground flex-shrink-0" />
                          </div>

                          {isOpen && (
                            <div className="border-t border-border px-4 py-4 bg-muted/10 space-y-4">
                              {/* Метрики */}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white rounded-xl p-3 text-center">
                                  <div className="text-lg font-bold">{item.days_on_market}</div>
                                  <div className="text-[10px] text-muted-foreground">дней на рынке</div>
                                </div>
                                <div className="bg-white rounded-xl p-3 text-center">
                                  <div className="text-lg font-bold">{item.views_total}</div>
                                  <div className="text-[10px] text-muted-foreground">просмотров</div>
                                </div>
                                <div className="bg-white rounded-xl p-3 text-center">
                                  <div className="text-lg font-bold">{item.leads_count}</div>
                                  <div className="text-[10px] text-muted-foreground">заявок</div>
                                </div>
                              </div>
                              {/* Каналы */}
                              {item.channels && item.channels.length > 0 && (
                                <div>
                                  <div className="text-xs font-semibold text-muted-foreground mb-2">Распределение бюджета по каналам</div>
                                  <div className="space-y-2">
                                    {item.channels.map((ch, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs">
                                        <div className="w-24 text-muted-foreground truncate">{ch.name}</div>
                                        <div className="flex-1 bg-muted/40 rounded-full h-1.5">
                                          <div
                                            className={`h-1.5 rounded-full ${ch.color === 'red' ? 'bg-red-500' : ch.color === 'green' ? 'bg-emerald-500' : 'bg-brand-blue'}`}
                                            style={{ width: `${Math.round(ch.budget / item.budget * 100)}%` }}
                                          />
                                        </div>
                                        <div className="w-20 text-right font-semibold">{fmtMoney(ch.budget)}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredBudget.length === 0 && (
                      <div className="text-center py-10 text-muted-foreground text-sm">
                        <Icon name="CheckCircle2" size={32} className="mx-auto mb-2 text-emerald-400" />
                        Нет объектов в этой категории
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted-foreground">
                  <Icon name="Loader2" size={24} className="animate-spin mx-auto mb-2" />
                  <p className="text-sm">Загрузка данных умного бюджета…</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}