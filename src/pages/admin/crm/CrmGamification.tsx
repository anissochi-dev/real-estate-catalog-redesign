import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { CRM_URL } from '@/lib/adminApi';

const MEDALS = ['🥇', '🥈', '🥉'];
const ROLE_LABELS: Record<string, string> = {
  broker: 'Брокер',
  director: 'Директор',
  office_manager: 'Офис-менеджер',
  manager: 'Менеджер',
};

export default function CrmGamification() {
  const { token } = useAuth();
  const [period, setPeriod] = useState<'month' | 'week' | 'all'>('month');

  const headers = { 'X-Auth-Token': token || '' };

  interface LeaderRow {
    id: number; name: string; avatar?: string; role: string;
    points: number; deals_won: number; commission?: number;
    badges?: { key: string; label: string; color: string }[];
  }

  const { data: leaderboard = [], isLoading } = useQuery<LeaderRow[]>({
    queryKey: ['crm-points', period],
    queryFn: async () => {
      const r = await fetch(`${CRM_URL}/points?period=${period}`, { headers });
      return r.json();
    },
  });

  const fmtMoney = (n: number) => {
    if (!n) return '0 ₽';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн ₽`;
    if (n >= 1_000) return `${Math.round(n / 1_000)} тыс ₽`;
    return `${n.toLocaleString('ru')} ₽`;
  };

  const BADGE_COLORS: Record<string, string> = {
    amber:   'bg-amber-100 text-amber-700 border-amber-200',
    blue:    'bg-blue-100 text-blue-700 border-blue-200',
    violet:  'bg-violet-100 text-violet-700 border-violet-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  const POINT_RULES = [
    { action: 'Создана сделка', points: 10, icon: 'Plus' },
    { action: 'Сделка выиграна', points: 50, icon: 'Trophy' },
    { action: 'Добавлен собственник', points: 5, icon: 'UserPlus' },
    { action: 'Активность добавлена', points: 2, icon: 'MessageCircle' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-700">Рейтинг команды</h2>
          <p className="text-sm text-muted-foreground">Геймификация и мотивация брокеров</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {(['week', 'month', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${period === p ? 'bg-white shadow-sm text-brand-blue' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Всё время'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Топ-3 */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Icon name="Loader2" size={22} className="animate-spin mr-2" /> Загрузка...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground">
              <Icon name="Trophy" size={40} className="mx-auto mb-3 opacity-30" />
              <div>Нет данных за выбранный период</div>
            </div>
          ) : leaderboard.map((member, idx) => (
            <div
              key={member.id}
              className={`bg-white rounded-2xl border border-border p-4 flex items-center gap-4 transition ${idx === 0 ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
            >
              <div className="w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0">
                {idx < 3 ? MEDALS[idx] : <span className="text-lg font-bold text-muted-foreground">#{idx + 1}</span>}
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-blue to-blue-400 flex items-center justify-center text-white font-bold flex-shrink-0">
                {member.avatar ? (
                  <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />
                ) : member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{member.name}</div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{ROLE_LABELS[member.role] || member.role}</Badge>
                  <span className="text-xs text-muted-foreground">Побед: {member.deals_won}</span>
                  {member.commission ? (
                    <span className="text-xs text-emerald-600 font-medium">
                      Комиссия: {fmtMoney(member.commission)}
                    </span>
                  ) : null}
                </div>
                {member.badges && member.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {member.badges.map(b => (
                      <span key={b.key}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${BADGE_COLORS[b.color] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-2xl font-bold ${idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-600' : 'text-brand-blue'}`}>
                  {member.points.toLocaleString('ru')}
                </div>
                <div className="text-xs text-muted-foreground">очков</div>
              </div>
            </div>
          ))}
        </div>

        {/* Правила начисления */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-border p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Icon name="Zap" size={16} className="text-brand-orange" />
              Правила начисления
            </h3>
            <div className="space-y-3">
              {POINT_RULES.map(rule => (
                <div key={rule.action} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon name={rule.icon} size={14} />
                    {rule.action}
                  </div>
                  <Badge className="bg-green-100 text-green-700 border-0">+{rule.points}</Badge>
                </div>
              ))}
            </div>
          </div>

          {leaderboard.length > 0 && (
            <div className="bg-gradient-to-br from-brand-blue to-blue-600 rounded-2xl p-4 text-white">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80 mb-2">Лидер {period === 'week' ? 'недели' : period === 'month' ? 'месяца' : ''}</div>
              <div className="text-xl font-display font-700">{leaderboard[0].name}</div>
              <div className="text-3xl font-bold mt-1">{leaderboard[0].points.toLocaleString('ru')} <span className="text-base font-normal opacity-80">очков</span></div>
              <div className="mt-2 text-sm opacity-80">Сделок закрыто: {leaderboard[0].deals_won}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}