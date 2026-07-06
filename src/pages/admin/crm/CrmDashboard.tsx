import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { crmUrl } from '@/lib/adminApi';

type Period = 'week' | 'month' | 'year' | 'all';

const PERIOD_OPTS: { value: Period; label: string }[] = [
  { value: 'week',  label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'year',  label: 'Год' },
  { value: 'all',   label: 'Всё время' },
];

const PERIOD_LABEL: Record<Period, string> = {
  week: 'за неделю', month: 'за месяц', year: 'за год', all: 'за всё время',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  call: 'Звонок', meeting: 'Встреча', email: 'Письмо', task: 'Задача', other: 'Прочее',
};

const fmtMoney = (n: number) => {
  if (!n) return '0 ₽';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${n.toLocaleString('ru')} ₽`;
};

const fmtDt = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const hoursAgo = (s: string | null) => {
  if (!s) return null;
  const diff = (Date.now() - new Date(s).getTime()) / 3600000;
  if (diff < 1) return `${Math.round(diff * 60)} мин назад`;
  if (diff < 24) return `${Math.round(diff)} ч назад`;
  return `${Math.floor(diff / 24)} дн. назад`;
};

// Аватарка-заглушка из инициалов
function Avatar({ name, avatar, size = 32 }: { name: string; avatar?: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['bg-brand-blue', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (avatar) return (
    <img src={avatar} alt={name} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }} />
  );
  return (
    <div className={`${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, color = 'blue', alert, onClick,
}: {
  icon: string; label: string; value: string | number; sub?: string;
  color?: string; alert?: boolean; onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-brand-blue/10 text-brand-blue',
    green:  'bg-emerald-100 text-emerald-600',
    amber:  'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
    rose:   'bg-rose-100 text-rose-600',
    orange: 'bg-orange-100 text-orange-600',
    red:    'bg-red-100 text-red-600',
  };
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border p-4 flex items-start gap-3 transition
        ${alert ? 'border-red-300 bg-red-50/50' : 'border-border'}
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorMap[color]}`}>
        <Icon name={icon} size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-2xl font-bold leading-tight ${alert ? 'text-red-600' : ''}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </div>
      {alert && <div className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0 animate-pulse" />}
    </div>
  );
}

function SectionCard({ icon, title, badge, children, className = '' }: {
  icon: string; title: string; badge?: string | number; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-border p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon name={icon} size={16} className="text-brand-blue" />
        <span className="font-semibold text-sm">{title}</span>
        {badge !== undefined && (
          <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function CrmDashboard({ setSection }: { setSection?: (s: string) => void }) {
  const { token } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const headers = { 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-dashboard', period],
    queryFn: async () => {
      const r = await fetch(crmUrl('dashboard', null, null, { period }), { headers });
      return r.json();
    },
  });

  const openDeal = (id: number) => {
    try { localStorage.setItem('crm_open_deal_id', String(id)); } catch { /* ignore */ }
    setSection?.('crm-kanban');
  };

  const goToLeads = () => setSection?.('leads');

  // Данные
  const d = data ?? {};
  const funnel: { id: number; name: string; color: string; count: number; amount: number }[] = d.funnel ?? [];
  const funnelMax = Math.max(...funnel.map(f => f.count), 1);
  const timeline: { day: string; count: number }[] = d.timeline ?? [];
  const timelineMax = Math.max(...timeline.map(t => t.count), 1);
  const leaderboard: { id: number; name: string; avatar: string | null; points: number }[] = d.leaderboard ?? [];
  const teamStats: { id: number; name: string; avatar: string | null; deals_count: number; commission_sum: number; won_count: number }[] = d.team_stats ?? [];
  const freshLeads: { id: number; name: string; phone: string; source: string; created_at: string; message: string }[] = d.fresh_leads ?? [];
  const dealsList: { id: number; title: string; amount: number; commission: number; stage_name: string; stage_color: string; is_win: boolean; manager_name: string; created_at: string }[] = d.deals_list ?? [];
  const upcomingList: { id: number; title: string; starts_at: string; event_type: string; assignee_name: string; deal_id: number; deal_title: string }[] = d.upcoming_list ?? [];

  const Skeleton = () => <div className="h-6 w-14 bg-muted rounded animate-pulse" />;

  return (
    <div className="space-y-4">

      {/* ── Шапка: заголовок + период ── */}
      <div className="bg-white rounded-2xl border border-border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0 sm:flex-1">
          <div className="w-10 h-10 rounded-xl bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
            <Icon name="LayoutDashboard" size={20} className="text-brand-blue" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg leading-none">Командный пульт</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Сделки, команда и активность {PERIOD_LABEL[period]}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:flex gap-1 bg-muted/40 rounded-xl p-1 flex-shrink-0">
          {PERIOD_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                period === opt.value ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI-строка ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon="Handshake"  label={`Сделок ${PERIOD_LABEL[period]}`}   color="blue"
          value={isLoading ? '—' : d.deals_period ?? 0}
          sub={`Всего: ${d.total_deals ?? 0}`} />
        <KpiCard icon="Trophy"     label={`Выиграно ${PERIOD_LABEL[period]}`} color="green"
          value={isLoading ? '—' : d.won_deals_period ?? 0}
          sub={`Конверсия: ${d.conversion_rate ?? 0}%`} />
        <KpiCard icon="Banknote"   label={`Комиссия ${PERIOD_LABEL[period]}`} color="orange"
          value={isLoading ? '—' : fmtMoney(d.commission_period ?? 0)}
          sub={`Всего: ${fmtMoney(d.total_commission ?? 0)}`} />
        <KpiCard icon="Clock"      label="Просрочено" color="amber"
          value={isLoading ? '—' : d.overdue_deals ?? 0}
          sub="> 14 дней без активности"
          alert={!isLoading && (d.overdue_deals ?? 0) > 0}
          onClick={() => setSection?.('crm-kanban')} />
        <KpiCard icon="Inbox"      label="Заявок без ответа" color="red"
          value={isLoading ? '—' : d.leads_unanswered ?? 0}
          sub={`+${d.leads_today ?? 0} сегодня`}
          alert={!isLoading && (d.leads_unanswered ?? 0) > 0}
          onClick={goToLeads} />
        <KpiCard icon="Calendar"   label="Событий на 7 дней" color="purple"
          value={isLoading ? '—' : d.upcoming_events ?? 0}
          sub="предстоящие" />
      </div>

      {/* ── Строка: тревоги + события ── */}
      {!isLoading && ((d.leads_unanswered ?? 0) > 0 || (d.overdue_deals ?? 0) > 0 || freshLeads.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Свежие лиды без ответа */}
          {freshLeads.length > 0 && (
            <SectionCard icon="AlertCircle" title="Заявки без ответа" badge={d.leads_unanswered}>
              <div className="space-y-2">
                {freshLeads.map(lead => (
                  <div
                    key={lead.id}
                    onClick={goToLeads}
                    className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200 cursor-pointer hover:bg-red-100 transition"
                  >
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Icon name="User" size={14} className="text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-red-900">{lead.name}</span>
                        <span className="text-[10px] text-red-500 font-medium">{hoursAgo(lead.created_at)}</span>
                      </div>
                      <div className="text-xs text-red-700 font-mono mt-0.5">{lead.phone}</div>
                      {lead.message && (
                        <div className="text-xs text-red-600/80 mt-0.5 truncate">{lead.message}</div>
                      )}
                    </div>
                    <Icon name="ArrowRight" size={14} className="text-red-400 flex-shrink-0 mt-1" />
                  </div>
                ))}
                {(d.leads_unanswered ?? 0) > freshLeads.length && (
                  <button onClick={goToLeads}
                    className="w-full text-xs text-red-600 font-semibold text-center py-2 hover:underline">
                    Ещё {(d.leads_unanswered ?? 0) - freshLeads.length} заявок → открыть все
                  </button>
                )}
              </div>
            </SectionCard>
          )}

          {/* Ближайшие события */}
          {upcomingList.length > 0 && (
            <SectionCard icon="Calendar" title="Ближайшие события" badge={d.upcoming_events}>
              <div className="space-y-2">
                {upcomingList.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl bg-violet-50 border border-violet-200">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <Icon name="Calendar" size={14} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-violet-900 truncate">{ev.title}</div>
                      <div className="text-xs text-violet-700 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
                        <span>·</span>
                        <span>{fmtDt(ev.starts_at)}</span>
                        {ev.assignee_name && <span>· {ev.assignee_name}</span>}
                      </div>
                      {ev.deal_title && (
                        <button
                          onClick={() => ev.deal_id && openDeal(ev.deal_id)}
                          className="text-[10px] text-violet-500 hover:underline mt-0.5 text-left truncate block"
                        >
                          Сделка: {ev.deal_title}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Воронка + динамика ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Воронка этапов */}
        <SectionCard icon="Filter" title="Воронка сделок">
          {funnel.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет этапов</p>
          ) : (
            <div className="space-y-2.5">
              {funnel.map(stage => (
                <div key={stage.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#64748b' }} />
                      <span className="text-sm font-medium truncate max-w-[140px]">{stage.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      <span className="font-bold">{stage.count}</span>
                      {stage.amount > 0 && (
                        <span className="text-muted-foreground">{fmtMoney(stage.amount)}</span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${funnelMax > 0 ? Math.max(4, Math.round(stage.count / funnelMax * 100)) : 0}%`,
                        backgroundColor: stage.color || '#64748b',
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border mt-2 flex justify-between text-xs text-muted-foreground">
                <span>Активных сделок: <b className="text-foreground">{funnel.reduce((s, f) => s + f.count, 0)}</b></span>
                <span>На сумму: <b className="text-foreground">{fmtMoney(funnel.reduce((s, f) => s + f.amount, 0))}</b></span>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Динамика */}
        <SectionCard icon="TrendingUp" title={`Динамика сделок ${PERIOD_LABEL[period]}`}
          badge={`${dealsList.length} шт`}>
          {isLoading ? (
            <div className="h-24 bg-muted/30 rounded-xl animate-pulse" />
          ) : timeline.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Нет сделок за период</div>
          ) : (
            <>
              <div className="flex items-end gap-0.5 h-24 mb-3">
                {timeline.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div
                      className="w-full bg-brand-blue/30 hover:bg-brand-blue rounded-t-sm transition-all"
                      style={{ height: `${Math.max(Math.round(t.count / timelineMax * 100), 4)}%` }}
                    />
                    <div className="absolute bottom-full mb-1 text-[10px] bg-foreground text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {t.day.slice(5)}: {t.count}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{timeline[0]?.day?.slice(5)}</span>
                <span className="font-semibold text-brand-blue">{fmtMoney(d.amount_period ?? 0)}</span>
                <span>{timeline[timeline.length - 1]?.day?.slice(5)}</span>
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Команда: рейтинг + активность ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Рейтинг по очкам */}
        <SectionCard icon="Star" title={`Рейтинг команды ${PERIOD_LABEL[period]}`}>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((u, i) => (
                <div key={u.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
                  i === 0 ? 'bg-amber-50 border border-amber-200' :
                  i === 1 ? 'bg-slate-50 border border-slate-200' :
                  i === 2 ? 'bg-orange-50/60 border border-orange-200/60' :
                  'bg-muted/20 border border-border/50'
                }`}>
                  <span className="text-lg w-6 text-center flex-shrink-0">
                    {i < 3 ? MEDALS[i] : <span className="text-xs text-muted-foreground font-bold">{i + 1}</span>}
                  </span>
                  <Avatar name={u.name} avatar={u.avatar} size={32} />
                  <span className="flex-1 text-sm font-medium truncate">{u.name}</span>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-amber-600">{u.points} pts</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Активность брокеров: сделки за период */}
        <SectionCard icon="Users" title={`Активность команды ${PERIOD_LABEL[period]}`}>
          {teamStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          ) : (
            <div className="space-y-2">
              {teamStats.map(u => {
                const maxDeals = Math.max(...teamStats.map(x => x.deals_count), 1);
                return (
                  <div key={u.id} className="flex items-center gap-3">
                    <Avatar name={u.name} avatar={u.avatar} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate">{u.name}</span>
                        <div className="flex items-center gap-2 text-xs text-right flex-shrink-0 ml-2">
                          <span className="font-bold">{u.deals_count}</span>
                          {u.won_count > 0 && (
                            <span className="text-emerald-600 font-semibold">({u.won_count} ✓)</span>
                          )}
                          {u.commission_sum > 0 && (
                            <span className="text-brand-orange font-semibold hidden sm:inline">
                              {fmtMoney(u.commission_sum)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-brand-blue transition-all duration-500"
                          style={{ width: `${Math.max(4, Math.round(u.deals_count / maxDeals * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Список сделок за период ── */}
      <SectionCard icon="Handshake" title={`Сделки ${PERIOD_LABEL[period]}`}
        badge={dealsList.length > 0 ? `${dealsList.length} · ${fmtMoney(d.amount_period ?? 0)}` : undefined}>
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted/30 rounded-xl animate-pulse" />
          ))}</div>
        ) : dealsList.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Icon name="Handshake" size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">Нет сделок за период</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {dealsList.map(deal => (
              <button
                key={deal.id}
                onClick={() => openDeal(deal.id)}
                className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-brand-blue/[0.03] hover:border-brand-blue/30 transition group"
              >
                {/* Этап */}
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: deal.stage_color || '#94a3b8' }} />
                {/* Инфо */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{deal.title}</span>
                    {deal.is_win && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                        ✓ Выиграна
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    {deal.stage_name && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: deal.stage_color || '#94a3b8' }} />
                        {deal.stage_name}
                      </span>
                    )}
                    {deal.manager_name && <span>· {deal.manager_name}</span>}
                    {deal.created_at && <span>· {fmtDate(deal.created_at)}</span>}
                  </div>
                </div>
                {/* Сумма */}
                <div className="text-right flex-shrink-0">
                  {deal.amount > 0 && (
                    <div className="font-bold text-sm">{fmtMoney(deal.amount)}</div>
                  )}
                  {deal.commission > 0 && (
                    <div className="text-[10px] text-brand-orange">+{fmtMoney(deal.commission)}</div>
                  )}
                </div>
                <Icon name="ChevronRight" size={15} className="text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition" />
              </button>
            ))}
          </div>
        )}
      </SectionCard>

    </div>
  );
}