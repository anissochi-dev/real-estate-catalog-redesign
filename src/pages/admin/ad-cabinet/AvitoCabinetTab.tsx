import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { AVITO_API_URL, AvitoData } from './types';

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

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
            Публикация объектов на Авито пока идёт через XML-выгрузку (галочка «Авито» в карточке объекта). Статистика по объявлениям появится следующим шагом.
          </div>
        </>
      )}
    </div>
  );
}
