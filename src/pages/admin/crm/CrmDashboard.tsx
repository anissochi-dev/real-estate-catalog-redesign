import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { CRM_URL } from '@/lib/adminApi';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function CrmDashboard() {
  const { token } = useAuth();
  const headers = { 'X-Auth-Token': token || '' };

  const { data, isLoading } = useQuery({
    queryKey: ['crm-dashboard'],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/dashboard`, { headers });
      return r.json();
    },
  });

  const stats = [
    { label: 'Всего сделок', value: data?.total_deals ?? '—', icon: 'Handshake', color: 'text-brand-blue' },
    { label: 'Закрыто успешно', value: data?.won_deals ?? '—', icon: 'Trophy', color: 'text-green-600' },
    { label: 'Собственников', value: data?.total_owners ?? '—', icon: 'Users', color: 'text-purple-600' },
    { label: 'Комиссия (₽)', value: data?.total_commission ? Number(data.total_commission).toLocaleString('ru') : '—', icon: 'Banknote', color: 'text-brand-orange' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-700">CRM — Обзор</h2>
        <p className="text-sm text-muted-foreground">Сводная статистика по сделкам и команде</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-border p-5">
            <div className={`${s.color} mb-2`}>
              <Icon name={s.icon} size={22} />
            </div>
            {isLoading ? (
              <div className="h-7 w-16 bg-muted rounded animate-pulse mb-1" />
            ) : (
              <div className="text-2xl font-bold font-display">{s.value}</div>
            )}
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Воронка */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Icon name="Filter" size={16} className="text-brand-blue" />
            Распределение по этапам
          </h3>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : data?.funnel?.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Нет сделок</div>
          ) : (
            <div className="space-y-2">
              {(data?.funnel || []).map((stage: { id: number; name: string; color: string; count: number }) => {
                const maxCount = Math.max(...(data?.funnel || []).map((s: { count: number }) => s.count), 1);
                const width = Math.round((stage.count / maxCount) * 100);
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-right text-muted-foreground truncate flex-shrink-0">{stage.name}</div>
                    <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center px-2"
                        style={{ width: `${Math.max(width, stage.count > 0 ? 8 : 0)}%`, backgroundColor: stage.color }}
                      >
                        {stage.count > 0 && <span className="text-white text-xs font-bold">{stage.count}</span>}
                      </div>
                    </div>
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