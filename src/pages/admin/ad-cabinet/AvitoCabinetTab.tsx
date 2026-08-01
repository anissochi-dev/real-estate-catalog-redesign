import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { AVITO_API_URL, AvitoData, AVITO_STATUS_STYLES } from './types';

const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export default function AvitoCabinetTab() {
  const [data, setData] = useState<AvitoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${AVITO_API_URL}&sync=1` : AVITO_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к Авито'))
      .finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number) => (n || 0).toLocaleString('ru');

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-border p-4 h-16 animate-pulse" />
        <div className="bg-white rounded-xl border border-border p-4 h-32 animate-pulse" />
      </div>
    );
  }

  if (error) {
    const isSetup = error.includes('не настроено');
    return (
      <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <Icon name="AlertCircle" size={24} className="text-red-500" />
        </div>
        <div className="font-semibold text-foreground">{isSetup ? 'Авито не подключено' : 'Ошибка подключения'}</div>
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
  const { last_sync } = data;
  const syncError = last_sync?.error;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="ShoppingBag" size={20} className="text-emerald-600" />
              Кабинет Авито
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
            {syncing ? 'Проверка…' : 'Проверить подключение'}
          </button>
        </div>
      </div>

      {syncError ? (
        <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <Icon name="AlertCircle" size={24} className="text-red-500" />
          </div>
          <div className="font-semibold text-foreground">Не удалось подключиться</div>
          <div className="text-sm text-muted-foreground max-w-sm">{syncError}</div>
          <div className="text-xs text-muted-foreground max-w-sm">
            Проверьте правильность Client ID и Client Secret в Настройках → Интеграции → Площадки
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold flex items-center gap-1.5">
                <Icon name="CheckCircle2" size={16} className="text-emerald-600" />
                Подключено
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{last_sync?.account_name || '—'}</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(Number(last_sync?.balance_real || 0))} ₽</div>
              <div className="text-xs text-muted-foreground">Баланс кошелька</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(Number(last_sync?.balance_bonus || 0))} ₽</div>
              <div className="text-xs text-muted-foreground">Бонусный счёт</div>
            </div>
          </div>

          {data.last_report && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Icon name="FileText" size={16} className="text-brand-blue" />
                Отчёт по автозагрузке
              </h3>
              {data.last_report.error ? (
                <div className="text-sm text-red-600">{data.last_report.error}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <div className="text-sm font-bold">{data.last_report.status_label || '—'}</div>
                    <div className="text-xs text-muted-foreground">Статус последней выгрузки</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">{data.last_report.total_ads ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">Объявлений обработано</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">
                      {data.last_report.finished_at ? new Date(data.last_report.finished_at).toLocaleString('ru') : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">Завершено</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!!data.items?.length && (
            <div className="bg-white rounded-2xl border border-border p-4 overflow-x-auto">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Icon name="ListChecks" size={16} className="text-brand-blue" />
                Объявления на Авито
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-3 font-medium">Объект</th>
                    <th className="pb-2 pr-3 font-medium">Сделка</th>
                    <th className="pb-2 pr-3 font-medium">Статус</th>
                    <th className="pb-2 pr-3 font-medium text-right">Просмотры</th>
                    <th className="pb-2 pr-3 font-medium text-right">Обращения</th>
                    <th className="pb-2 pr-3 font-medium text-right">Избранное</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const style = AVITO_STATUS_STYLES[item.status || ''] || { cls: 'bg-gray-100 text-gray-500' };
                    return (
                      <tr key={item.listing_id} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 max-w-[220px] truncate" title={item.title || ''}>{item.title || '—'}</td>
                        <td className="py-2 pr-3">{DEAL_LABELS[item.deal || ''] || item.deal || '—'}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${style.cls}`}>
                            {item.status_label || '—'}
                          </span>
                          {item.status_message && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] truncate" title={item.status_message}>
                              {item.status_message}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">{fmt(item.uniq_views || 0)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(item.uniq_contacts || 0)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(item.uniq_favorites || 0)}</td>
                        <td className="py-2">
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">
                              <Icon name="ExternalLink" size={13} />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}