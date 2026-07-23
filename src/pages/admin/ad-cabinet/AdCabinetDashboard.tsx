import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { CIAN_API_URL, CianData, PlatformCard, SERVICE_TYPE_LABELS } from './types';

interface Props {
  onOpenPlatform: (key: string) => void;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  cian: { label: 'ЦИАН', icon: 'Building2', color: 'bg-sky-100 text-sky-600' },
  avito: { label: 'Авито', icon: 'ShoppingBag', color: 'bg-emerald-100 text-emerald-600' },
  yandex_realty: { label: 'Яндекс.Недвижимость', icon: 'Home', color: 'bg-red-100 text-red-600' },
  domclick: { label: 'ДомКлик', icon: 'MousePointer', color: 'bg-blue-100 text-blue-600' },
  youla: { label: 'Юла', icon: 'Circle', color: 'bg-violet-100 text-violet-600' },
};

const PLATFORM_ORDER = ['cian', 'avito', 'yandex_realty', 'domclick', 'youla'];

function KpiCard({ icon, label, value, sub, color = 'blue' }: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
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
      </div>
    </div>
  );
}

function PlatformCardView({ card, onClick }: { card: PlatformCard; onClick: () => void }) {
  const meta = PLATFORM_META[card.key];
  const statusMeta = {
    active: { label: 'Активен', cls: 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'Пауза', cls: 'bg-amber-100 text-amber-700' },
    not_connected: { label: 'Не подключено', cls: 'bg-muted text-muted-foreground' },
  }[card.status];

  return (
    <div
      onClick={card.connected ? onClick : undefined}
      className={`bg-white rounded-2xl border border-border p-4 flex flex-col gap-2 transition ${
        card.connected ? 'cursor-pointer hover:border-brand-blue hover:shadow-sm' : 'opacity-70'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
          <Icon name={meta.icon} size={18} />
        </div>
        <div className="font-semibold text-sm">{meta.label}</div>
      </div>
      {card.connected ? (
        <>
          <div className="text-xs text-muted-foreground">
            {card.offersCount} объявл.{card.balance !== null ? ` · ${card.balance.toLocaleString('ru')} ₽` : ''}
          </div>
          {card.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {card.services.map(s => (
                <span key={s.label} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">Ключ API не настроен</div>
      )}
      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${statusMeta.cls}`}>
        <Icon name={card.status === 'active' ? 'CheckCircle2' : card.status === 'paused' ? 'PauseCircle' : 'Circle'} size={10} />
        {statusMeta.label}
      </span>
    </div>
  );
}

export default function AdCabinetDashboard({ onOpenPlatform }: Props) {
  const [cian, setCian] = useState<CianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${CIAN_API_URL}?sync=1` : CIAN_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setCian(null); }
        else { setCian(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к ЦИАН'))
      .finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => (n || 0).toLocaleString('ru');

  const platforms: PlatformCard[] = PLATFORM_ORDER.map(key => {
    if (key === 'cian' && cian && !error) {
      const servicesEntries = Object.entries(cian.summary.services_by_type || {})
        .filter(([type]) => type !== 'FreeObject')
        .map(([type, count]) => ({ label: SERVICE_TYPE_LABELS[type] || type, count }));
      return {
        key, label: 'ЦИАН', icon: '', color: '',
        connected: true,
        offersCount: cian.summary.offers_count,
        balance: cian.balance?.total_balance ? Number(cian.balance.total_balance) : 0,
        status: cian.summary.published_count > 0 ? 'active' : 'paused',
        services: servicesEntries,
      };
    }
    return {
      key, label: PLATFORM_META[key].label, icon: '', color: '',
      connected: false, offersCount: 0, balance: null, status: 'not_connected', services: [],
    };
  });

  const totalOffers = platforms.reduce((a, p) => a + p.offersCount, 0);
  const activeCount = platforms.filter(p => p.status === 'active').length;
  const totalBalance = platforms.reduce((a, p) => a + (p.balance || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="Megaphone" size={20} className="text-brand-blue" />
              Рекламный кабинет
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Сводка по всем площадкам размещения объектов
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name="RefreshCw" size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Синхронизация…' : 'Синхронизировать'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-4 h-20 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon="Building2" label="Всего объявлений" value={fmt(totalOffers)} color="blue" />
            <KpiCard icon="CheckCircle2" label="Активных площадок" value={activeCount} sub={`из ${platforms.length}`} color="green" />
            <KpiCard icon="Eye" label="Просмотров (ЦИАН)" value={fmt(cian?.summary.total_views || 0)} color="purple" />
            <KpiCard icon="Wallet" label="Баланс площадок" value={`${fmt(totalBalance)} ₽`} color="amber" />
          </div>

          {error && (
            <div className="bg-white rounded-xl border border-border p-4 flex items-start gap-2 text-sm">
              <Icon name="AlertCircle" size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-600">ЦИАН: ошибка подключения</div>
                <div className="text-xs text-muted-foreground mt-0.5">{error}</div>
              </div>
            </div>
          )}

          <div>
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Icon name="Zap" size={15} className="text-brand-blue" /> Быстрые действия по площадкам
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {platforms.map(p => (
                <PlatformCardView key={p.key} card={p} onClick={() => onOpenPlatform(p.key)} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
