import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { req } from '@/pages/admin/settings/siteHealthTypes';
import { MarketingStats, STATUS_LABELS, CATEGORY_LABELS } from './shared';
import MarketingDashboardHeader from './dashboard/MarketingDashboardHeader';
import MarketingOverviewSection from './dashboard/MarketingOverviewSection';
import MarketingSourcesSection from './dashboard/MarketingSourcesSection';
import { MarketingObjectsSection, MarketingSmartBudgetSection } from './dashboard/MarketingBudgetSection';

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
        totals: statsData.totals ?? { total_leads: 0, leads_30d: 0, total_views: 0, active_listings: 0, total_deals: 0, total_commission: 0, won_deals: 0 },
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
  const maxSource = Math.max(...(stats?.leads_by_source.map(s => s.cnt) ?? [1]), 1);
  const maxStatus = Math.max(...(stats?.leads_by_status.map(s => s.cnt) ?? [1]), 1);

  return (
    <div className="space-y-4">

      <MarketingDashboardHeader
        period={period}
        setPeriod={setPeriod}
        loading={loading}
        stats={stats}
        highPriorityCount={highPriority.length}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        onRefresh={() => loadAll(period)}
        onExportCSV={() => stats && exportCSV(stats)}
      />

      {loading && !stats && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Icon name="Loader2" size={20} className="animate-spin" /> Загружаю данные…
        </div>
      )}

      {stats && (
        <>
          {activeSection === 'overview' && (
            <MarketingOverviewSection
              stats={stats}
              totalViews={totalViews}
              maxSource={maxSource}
              maxStatus={maxStatus}
              highPriority={highPriority}
              onGoToBudget={() => setActiveSection('budget')}
            />
          )}

          {activeSection === 'sources' && (
            <MarketingSourcesSection
              stats={stats}
              totalViews={totalViews}
              maxSource={maxSource}
            />
          )}

          {activeSection === 'objects' && (
            <MarketingObjectsSection stats={stats} />
          )}

          {activeSection === 'budget' && (
            <MarketingSmartBudgetSection budget={budget} />
          )}
        </>
      )}
    </div>
  );
}