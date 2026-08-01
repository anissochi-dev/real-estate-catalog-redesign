import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { StatData, fmt } from './internalCardTypes';
import { Spinner } from './TabOverview';

export function TabStats({ listingId, listing }: { listingId: number; listing: Listing }) {
  const [stats, setStats] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getListingStats(listingId).then(r => {
      setStats(r.stats || r || {});
    }).finally(() => setLoading(false));
  }, [listingId]);

  if (loading) return <Spinner />;

  const cards = [
    { label: 'Просмотров', value: stats?.total_views ?? 0, icon: 'Eye', color: 'from-brand-blue to-indigo-600' },
    { label: 'Звонков', value: stats?.total_calls ?? 0, icon: 'Phone', color: 'from-emerald-500 to-emerald-700' },
    { label: 'Заявок', value: stats?.total_leads ?? 0, icon: 'Inbox', color: 'from-brand-orange to-orange-600' },
    { label: 'Переходов QR', value: stats?.total_qr ?? 0, icon: 'QrCode', color: 'from-violet-500 to-violet-700' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl p-4 bg-gradient-to-br ${c.color} text-white`}>
            <Icon name={c.icon} size={20} className="mb-2 opacity-80" />
            <div className="text-2xl font-display font-700">{c.value}</div>
            <div className="text-xs opacity-90">{c.label}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Площадки</div>
        <div className="space-y-2">
          {[
            { key: 'export_avito', label: 'Авито', color: 'text-green-700 bg-green-50 border-green-200' },
            { key: 'export_yandex', label: 'Яндекс.Недвижимость', color: 'text-red-700 bg-red-50 border-red-200' },
            { key: 'export_cian', label: 'ЦИАН', color: 'text-blue-700 bg-blue-50 border-blue-200' },
          ].map(p => (
            <div key={p.key} className={`flex items-center justify-between px-4 py-2 rounded-xl border text-sm ${
              (listing as Record<string, unknown>)[p.key] ? p.color : 'bg-muted/30 border-border text-muted-foreground'
            }`}>
              <span className="font-medium">{p.label}</span>
              <span className="text-xs">
                {(listing as Record<string, unknown>)[p.key] ? 'Размещён' : 'Не размещён'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}