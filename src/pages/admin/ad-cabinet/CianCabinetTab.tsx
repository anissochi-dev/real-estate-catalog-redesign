import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { CIAN_API_URL, CianData, CianOfferRow, OFFER_STATUS_LABELS, SERVICE_TYPE_LABELS } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  office: 'Офис', retail: 'Торговое', warehouse: 'Склад', restaurant: 'Ресторан',
  hotel: 'Гостиница', business: 'Бизнес', gab: 'ГАБ', production: 'Производство',
  land: 'Участок', building: 'Здание', free_purpose: 'Свободное назначение', car_service: 'Автосервис',
};

function CallsPopover({ calls }: { calls: CianOfferRow['calls_list'] }) {
  const [open, setOpen] = useState(false);
  if (!calls.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
      >
        <Icon name="Phone" size={12} /> {calls.length}
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg p-2 w-56 max-h-52 overflow-y-auto">
          {calls.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span className="font-mono">{c.source_phone || '—'}</span>
              <span className="text-muted-foreground">{c.duration}с</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceBadges({ services }: { services: CianOfferRow['services'] }) {
  const active = services.filter(s => s.service_type !== 'FreeObject');
  if (!active.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(s => (
        <span key={s.service_type} title={s.paid_till ? `до ${new Date(s.paid_till).toLocaleDateString('ru')}` : ''}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
          {SERVICE_TYPE_LABELS[s.service_type] || s.service_type}
        </span>
      ))}
    </div>
  );
}

export default function CianCabinetTab() {
  const [data, setData] = useState<CianData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${CIAN_API_URL}?sync=1` : CIAN_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к ЦИАН'))
      .finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => (n || 0).toLocaleString('ru');

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-border p-4 h-16 animate-pulse" />
        <div className="bg-white rounded-xl border border-border p-4 h-64 animate-pulse" />
      </div>
    );
  }

  if (error) {
    const isSetup = error.includes('не настроен');
    return (
      <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <Icon name="AlertCircle" size={24} className="text-red-500" />
        </div>
        <div className="font-semibold text-foreground">{isSetup ? 'ЦИАН не подключён' : 'Ошибка подключения'}</div>
        <div className="text-sm text-muted-foreground max-w-sm">{error}</div>
        {isSetup && (
          <a href="/admin?section=settings&tab=integrations" className="text-xs text-brand-blue underline">
            Настройки → Интеграции → Площадки
          </a>
        )}
      </div>
    );
  }

  if (!data) return null;
  const { summary, offers, last_sync } = data;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="Building2" size={20} className="text-sky-600" />
              Кабинет ЦИАН
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {last_sync?.synced_at ? `Обновлено ${new Date(last_sync.synced_at).toLocaleString('ru')}` : 'Ещё не синхронизировано'}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{summary.offers_count}</div>
          <div className="text-xs text-muted-foreground">Объявлений</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold text-emerald-600">{summary.published_count}</div>
          <div className="text-xs text-muted-foreground">Опубликовано</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{fmt(summary.total_views)}</div>
          <div className="text-xs text-muted-foreground">Просмотров</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{fmt(summary.total_calls)}</div>
          <div className="text-xs text-muted-foreground">Звонков</div>
        </div>
      </div>

      {offers.some(o => !o.external_id) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
          <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
          Часть объявлений не привязана к объектам сайта — они заведены вручную в кабинете ЦИАН, а не через XML-выгрузку.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2.5 font-semibold">Объект</th>
                <th className="text-left px-3 py-2.5 font-semibold">Статус</th>
                <th className="text-right px-3 py-2.5 font-semibold">Просмотры</th>
                <th className="text-right px-3 py-2.5 font-semibold">Звонки</th>
                <th className="text-right px-3 py-2.5 font-semibold">Избранное</th>
                <th className="text-left px-3 py-2.5 font-semibold">Продвижение</th>
              </tr>
            </thead>
            <tbody>
              {offers.map(o => {
                const statusMeta = OFFER_STATUS_LABELS[o.status] || { label: o.status, cls: 'bg-muted text-muted-foreground' };
                return (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      {o.title ? (
                        <div>
                          <div className="font-medium">{o.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.category ? CATEGORY_LABELS[o.category] || o.category : ''}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-muted-foreground italic">Не привязан к сайту</div>
                          {o.url && (
                            <a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-brand-blue underline">
                              Открыть в ЦИАН
                            </a>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{fmt(o.views)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end"><CallsPopover calls={o.calls_list} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{fmt(o.add_to_favorites)}</td>
                    <td className="px-3 py-2.5"><ServiceBadges services={o.services} /></td>
                  </tr>
                );
              })}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    Нет объявлений в кабинете ЦИАН
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
