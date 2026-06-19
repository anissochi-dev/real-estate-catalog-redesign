import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { MarketingStats, CATEGORY_LABELS, DEAL_LABELS, fmtMoney } from '../shared';

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
  high:   { label: 'Срочно',   dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',         icon: 'AlertCircle' },
  medium: { label: 'Внимание', dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 border-amber-200',   icon: 'TrendingDown' },
  low:    { label: 'Норма',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'CheckCircle2' },
};

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

interface ObjectsSectionProps {
  stats: MarketingStats;
}

export function MarketingObjectsSection({ stats }: ObjectsSectionProps) {
  return (
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
  );
}

interface BudgetSectionProps {
  budget: { items: BudgetItem[]; summary: BudgetSummary } | null;
}

export function MarketingSmartBudgetSection({ budget }: BudgetSectionProps) {
  const [budgetFilter, setBudgetFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredBudget = budget?.items.filter(i =>
    budgetFilter === 'all' ? true : i.priority === budgetFilter
  ) ?? [];

  if (!budget) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-border p-8 text-center text-muted-foreground">
          <Icon name="Loader2" size={24} className="animate-spin mx-auto mb-2" />
          <p className="text-sm">Загрузка данных умного бюджета…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

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
          { id: 'all',    label: 'Все',       count: budget.items.length },
          { id: 'high',   label: 'Срочно',    count: budget.summary.priority_high },
          { id: 'medium', label: 'Внимание',  count: budget.summary.priority_medium },
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

    </div>
  );
}
