import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import PlatformIcon from '@/components/admin/PlatformIcon';
import { YANDEX_CALLS_API_URL, YandexCallsData } from './types';

const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export default function YandexCallsTab() {
  const [data, setData] = useState<YandexCallsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${YANDEX_CALLS_API_URL}&sync=1` : YANDEX_CALLS_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к Яндекс.Недвижимости'))
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
    const isSetup = error.includes('не настроена') || error.includes('не найден');
    return (
      <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <Icon name="AlertCircle" size={24} className="text-red-500" />
        </div>
        <div className="font-semibold text-foreground">{isSetup ? 'Яндекс.Недвижимость не подключена' : 'Ошибка подключения'}</div>
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
  const syncError = last_sync?.error;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <PlatformIcon platform="yandex_realty" icon="Home" size={20} className="text-red-600" />
              Яндекс.Недвижимость
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

      {syncError ? (
        <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <Icon name="AlertCircle" size={24} className="text-red-500" />
          </div>
          <div className="font-semibold text-foreground">Не удалось подключиться</div>
          <div className="text-sm text-muted-foreground max-w-sm">{syncError}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(last_sync?.offers_accepted ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Принято из {fmt(last_sync?.offers_total ?? 0)}</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(summary.total_shows)}</div>
              <div className="text-xs text-muted-foreground">Показов за 30 дней</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(summary.total_calls)}</div>
              <div className="text-xs text-muted-foreground">Звонков за 30 дней</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(summary.unique_objects)}</div>
              <div className="text-xs text-muted-foreground">Объектов в фиде</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className={`text-xl font-bold ${summary.with_errors > 0 ? 'text-red-600' : ''}`}>{fmt(summary.with_errors)}</div>
              <div className="text-xs text-muted-foreground">С ошибками индексации</div>
            </div>
          </div>

          {!!last_sync?.offers_declined && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
              {last_sync.offers_declined} объявлени{last_sync.offers_declined === 1 ? 'е' : 'й'} отклонено Яндексом при последней индексации фида — см. колонку «Ошибка» в таблице ниже.
            </div>
          )}

          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2.5 font-semibold">Объект</th>
                    <th className="text-left px-3 py-2.5 font-semibold">Ошибка</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Показы</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Показы карточки</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Показы телефона</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Звонки</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-xs">
                        Нет объявлений в фиде
                      </td>
                    </tr>
                  )}
                  {offers.map((o) => (
                    <tr key={o.yandex_offer_id || o.listing_id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        {o.title ? (
                          <div>
                            <div className="font-medium max-w-[220px] truncate" title={o.title}>{o.title}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{DEAL_LABELS[o.deal || ''] || o.deal || ''}</span>
                              {o.yandex_url && (
                                <>
                                  {o.deal && <span className="text-muted-foreground/40">·</span>}
                                  <a href={o.yandex_url} target="_blank" rel="noreferrer" className="text-brand-blue underline">
                                    Открыть на Яндексе
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground italic">Объект #{o.listing_id ?? '—'}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.error_type ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{o.error_type}</span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">OK</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">{fmt(o.shows)}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(o.card_shows)}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(o.phone_shows)}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(o.calls)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
