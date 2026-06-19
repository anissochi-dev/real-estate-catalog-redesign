import Icon from '@/components/ui/icon';
import { MarketingStats, SOURCE_COLORS, STATUS_LABELS, fmtMoney } from '../shared';

interface BudgetItem { id: number; title: string }

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
    blue:   'bg-brand-blue/10 text-brand-blue',
    green:  'bg-emerald-100 text-emerald-600',
    amber:  'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    rose:   'bg-rose-100 text-rose-600',
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

interface Props {
  stats: MarketingStats;
  totalViews: number;
  maxSource: number;
  maxStatus: number;
  highPriority: BudgetItem[];
  onGoToBudget: () => void;
}

export default function MarketingOverviewSection({
  stats, totalViews, maxSource, maxStatus, highPriority, onGoToBudget,
}: Props) {
  return (
    <div className="space-y-4">

      {/* Предупреждение если есть срочные объекты */}
      {highPriority.length > 0 && (
        <div
          onClick={onGoToBudget}
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

      {/* Динамика лидов по дням */}
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

      {/* 2 колонки */}
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
  );
}
