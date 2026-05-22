import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { CRM_URL } from '@/lib/adminApi';

const MEDALS = ['🥇', '🥈', '🥉'];

type Period = 'week' | 'month' | 'year' | 'all';

const fmtMoney = (n: number) => {
  if (!n) return '0 ₽';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
  return `${n.toLocaleString('ru')} ₽`;
};

export default function CrmDashboard() {
  const { token } = useAuth();
  const [period, setPeriod] = useState<Period>('month');
  const headers = { 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-dashboard', period],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/dashboard?period=${period}`, { headers });
      return r.json();
    },
  });

  const periodLabel: Record<Period, string> = {
    week: 'за неделю', month: 'за месяц', year: 'за год', all: 'за всё время',
  };

  const stats = [
    {
      label: `Сделки ${periodLabel[period]}`,
      value: data?.deals_period ?? '—',
      sub: `Всего: ${data?.total_deals ?? '—'}`,
      icon: 'Handshake', color: 'text-brand-blue',
    },
    {
      label: `Закрыто ${periodLabel[period]}`,
      value: data?.won_deals_period ?? '—',
      sub: `Всего: ${data?.won_deals ?? '—'}`,
      icon: 'Trophy', color: 'text-green-600',
    },
    {
      label: 'Просрочено',
      value: data?.overdue_deals ?? '—',
      sub: 'без обновл. >14 дней',
      icon: 'Clock', color: 'text-amber-600',
    },
    {
      label: 'События 7 дней',
      value: data?.upcoming_events ?? '—',
      sub: 'предстоящие',
      icon: 'Calendar', color: 'text-violet-600',
    },
    {
      label: `Комиссия ${periodLabel[period]}`,
      value: data?.commission_period ? fmtMoney(Number(data.commission_period)) : '—',
      sub: `Всего: ${data?.total_commission ? fmtMoney(Number(data.total_commission)) : '—'}`,
      icon: 'Banknote', color: 'text-brand-orange',
    },
    {
      label: 'Собственников',
      value: data?.total_owners ?? '—',
      sub: '',
      icon: 'Users', color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Icon name="PieChart" size={16} className="text-brand-blue" />
          <span className="font-display font-700 text-lg">CRM — Сделки и команда</span>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(['week', 'month', 'year', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${period === p ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : p === 'year' ? 'Год' : 'Всё время'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-border p-4">
            <div className={`${s.color} mb-2`}>
              <Icon name={s.icon} size={20} />
            </div>
            {isLoading ? (
              <div className="h-7 w-16 bg-muted rounded animate-pulse mb-1" />
            ) : (
              <div className="text-xl font-bold font-display">{s.value}</div>
            )}
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{s.label}</div>
            {s.sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Мини-график динамики создания сделок */}
      {data?.timeline && data.timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Icon name="TrendingUp" size={16} className="text-brand-blue" />
            Создано сделок {periodLabel[period]}
          </h3>
          <div className="flex items-end gap-1 h-24">
            {data.timeline.map((d: { day: string; count: number }) => {
              const max = Math.max(...data.timeline.map((x: { count: number }) => x.count), 1);
              const h = Math.round((d.count / max) * 100);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                  <div
                    className="w-full bg-brand-blue/30 hover:bg-brand-blue rounded-t-md transition-all"
                    style={{ height: `${Math.max(h, 4)}%` }}
                  />
                  <div className="absolute bottom-full mb-1 text-[10px] bg-foreground text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                    {d.day}: {d.count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Воронка */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Icon name="Filter" size={16} className="text-brand-blue" />
            Активные сделки по этапам
          </h3>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : data?.funnel?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Нет сделок</div>
          ) : (
            <div className="space-y-2">
              {(data?.funnel || []).map((stage: { id: number; name: string; color: string; count: number; amount?: number }) => {
                const maxCount = Math.max(...(data?.funnel || []).map((s: { count: number }) => s.count), 1);
                const width = Math.round((stage.count / maxCount) * 100);
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-right text-muted-foreground truncate flex-shrink-0">{stage.name}</div>
                    <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                        style={{ width: `${Math.max(width, stage.count > 0 ? 8 : 0)}%`, backgroundColor: stage.color }}
                      >
                        {stage.count > 0 && <span className="text-white text-xs font-bold">{stage.count}</span>}
                      </div>
                    </div>
                    {stage.amount ? (
                      <div className="w-20 text-right text-[11px] text-muted-foreground flex-shrink-0">
                        {fmtMoney(stage.amount)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Топ команды */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Icon name="Trophy" size={16} className="text-brand-orange" />
            Топ команды (месяц)
          </h3>
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : data?.leaderboard?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Нет данных</div>
          ) : (
            <div className="space-y-3">
              {(data?.leaderboard || []).map((member: { id: number; name: string; avatar?: string; points: number }, idx: number) => (
                <div key={member.id} className="flex items-center gap-3">
                  <div className="w-8 text-center text-xl flex-shrink-0">
                    {idx < 3 ? MEDALS[idx] : <span className="text-sm text-muted-foreground">#{idx + 1}</span>}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-blue to-blue-400 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                    {member.avatar ? (
                      <img src={member.avatar} className="w-full h-full rounded-full object-cover" alt={member.name} />
                    ) : member.name.charAt(0)}
                  </div>
                  <div className="flex-1 text-sm font-medium truncate">{member.name}</div>
                  <div className="text-sm font-bold text-brand-blue">{member.points.toLocaleString('ru')} <span className="text-xs font-normal text-muted-foreground">pts</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}