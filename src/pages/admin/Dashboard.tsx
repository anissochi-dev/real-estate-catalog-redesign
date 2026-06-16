import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import CrmDashboard from './crm/CrmDashboard';
import CrmCalendar from './crm/CrmCalendar';
import { useAuth } from '@/contexts/AuthContext';

interface Stats {
  listings_active: number;
  leads_total: number;
  leads_new: number;
  users_total: number;
  by_category: { category: string; c: number }[];
  leads_by_status: { status: string; c: number }[];
}

const CAT_LABELS: Record<string, string> = {
  office: 'Офисы',
  retail: 'Торговые помещения',
  warehouse: 'Склады',
  restaurant: 'Общепит',
  business: 'Готовый бизнес',
  production: 'Производство',
  hotel: 'Гостиницы',
  gab: 'ГАБ',
  land: 'Земельные участки',
  building: 'Здания',
  free_purpose: 'Своб. назначение',
  car_service: 'Автосервисы',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'На модерации',
  new: 'Новые',
  in_progress: 'В работе',
  done: 'Закрыты',
  rejected: 'Отказ',
};

export default function Dashboard({ setSection }: { setSection?: (s: string) => void }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!stats) return <div>Загрузка...</div>;

  const canSeeUsers = user && ['admin', 'director'].includes(user.role);

  const cards = [
    { label: 'Активных объектов', value: stats.listings_active, icon: 'Building2', color: 'from-brand-blue to-brand-blue-dark', show: true },
    { label: 'Всего лидов', value: stats.leads_total, icon: 'Inbox', color: 'from-brand-orange to-orange-600', show: true },
    { label: 'Новых лидов', value: stats.leads_new, icon: 'BellRing', color: 'from-emerald-500 to-emerald-700', show: true },
    { label: 'Пользователей', value: stats.users_total, icon: 'Users', color: 'from-violet-500 to-violet-700', show: !!canSeeUsers },
  ].filter(c => c.show);

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${cards.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : cards.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {cards.map(c => (
          <div
            key={c.label}
            className={`rounded-2xl p-5 bg-gradient-to-br ${c.color} text-white shadow-lg`}
          >
            <Icon name={c.icon} size={24} className="mb-3 opacity-80" />
            <div className="text-3xl font-display font-700">{c.value}</div>
            <div className="text-sm opacity-90 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="font-display font-700 text-lg mb-4">Объявления по категориям</div>
          <div className="space-y-2">
            {stats.by_category.map(r => (
              <div key={r.category} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                <span>{CAT_LABELS[r.category] || r.category}</span>
                <span className="font-semibold">{r.c}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="font-display font-700 text-lg mb-4">Лиды по статусам</div>
          <div className="space-y-2">
            {stats.leads_by_status.length === 0 ? (
              <div className="text-sm text-muted-foreground">Пока нет лидов</div>
            ) : (
              stats.leads_by_status.map(r => (
                <div key={r.status} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                  <span>{STATUS_LABELS[r.status] || r.status}</span>
                  <span className="font-semibold">{r.c}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <CrmCalendar />

      <CrmDashboard setSection={setSection} />
    </div>
  );
}