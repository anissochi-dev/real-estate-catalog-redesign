import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { YANDEX_CALLS_API_URL, YandexCallsData } from './types';

function formatDuration(seconds: number): string {
  if (!seconds) return '0с';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}

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
    const isSetup = error.includes('не настроена');
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
  const { summary, calls, last_sync } = data;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Icon name="Home" size={20} className="text-red-600" />
              Звонки Яндекс.Недвижимость
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{fmt(summary.total_calls)}</div>
          <div className="text-xs text-muted-foreground">Звонков за 30 дней</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{formatDuration(summary.total_duration)}</div>
          <div className="text-xs text-muted-foreground">Общая длительность</div>
        </div>
        <div className="bg-white rounded-xl border border-border p-3">
          <div className="text-xl font-bold">{fmt(summary.unique_objects)}</div>
          <div className="text-xs text-muted-foreground">Объектов со звонками</div>
        </div>
      </div>

      {calls.some(c => !c.external_id) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
          <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
          Часть звонков не удалось привязать к объекту сайта — Яндекс не всегда передаёт точный ID в названии объявления.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2.5 font-semibold">Объект</th>
                <th className="text-left px-3 py-2.5 font-semibold">Звонящий</th>
                <th className="text-left px-3 py-2.5 font-semibold">Дата</th>
                <th className="text-right px-3 py-2.5 font-semibold">Длительность</th>
                <th className="text-right px-3 py-2.5 font-semibold">Ожидание</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    Звонков пока нет
                  </td>
                </tr>
              )}
              {calls.map((c, i) => (
                <tr key={i} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2.5">
                    {c.title ? (
                      <div className="font-medium">{c.title}</div>
                    ) : (
                      <div className="text-muted-foreground italic">{c.object_name || 'Не привязан к сайту'}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">{c.incoming_phone || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {c.call_timestamp ? new Date(c.call_timestamp).toLocaleString('ru') : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatDuration(c.call_duration)}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{formatDuration(c.wait_duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
