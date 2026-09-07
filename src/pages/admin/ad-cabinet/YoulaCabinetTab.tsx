import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import PlatformIcon from '@/components/admin/PlatformIcon';
import { YOULA_API_URL, YoulaData } from './types';

const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export default function YoulaCabinetTab() {
  const [data, setData] = useState<YoulaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${YOULA_API_URL}&sync=1` : YOULA_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к Юле'))
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
    const isSetup = error.includes('не настроена');
    return (
      <div className="bg-white rounded-xl border border-border p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <Icon name="AlertCircle" size={24} className="text-red-500" />
        </div>
        <div className="font-semibold text-foreground">{isSetup ? 'Юла не подключена' : 'Ошибка подключения'}</div>
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
  const { last_sync, sync_result } = data;
  const syncError = last_sync?.error;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <PlatformIcon platform="youla" icon="ShoppingCart" size={20} className="text-violet-600" />
              Кабинет Юла
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
            {syncing ? 'Синхронизация…' : 'Синхронизировать и опубликовать'}
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
            Проверьте правильность Токена и ID профиля в Настройках → Интеграции → Площадки
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
              <div className="text-xs text-muted-foreground mt-0.5">{last_sync?.owner_name || last_sync?.owner_id || '—'}</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(data.items?.length || 0)}</div>
              <div className="text-xs text-muted-foreground">Объявлений на Юле</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(data.items?.filter(i => i.is_published).length || 0)}</div>
              <div className="text-xs text-muted-foreground">Опубликовано</div>
            </div>
          </div>

          {sync_result?.publish && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Icon name="UploadCloud" size={16} className="text-brand-blue" />
                Результат последней публикации
              </h3>
              {sync_result.publish.error ? (
                <div className="text-sm text-red-600">{sync_result.publish.error}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <span className="px-2 py-1.5 rounded bg-emerald-50 text-emerald-700 text-center">Создано: {sync_result.publish.created}</span>
                  <span className="px-2 py-1.5 rounded bg-blue-50 text-blue-700 text-center">Обновлено: {sync_result.publish.updated}</span>
                  <span className="px-2 py-1.5 rounded bg-muted text-center">В архиве: {sync_result.publish.archived}</span>
                  {sync_result.publish.failed > 0 && (
                    <span className="px-2 py-1.5 rounded bg-red-50 text-red-700 text-center">Ошибок: {sync_result.publish.failed}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {!!data.items?.length && (
            <div className="bg-white rounded-2xl border border-border p-4 overflow-x-auto">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <Icon name="ListChecks" size={16} className="text-brand-blue" />
                Объявления на Юле
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-3 font-medium">Объект</th>
                    <th className="pb-2 pr-3 font-medium">Сделка</th>
                    <th className="pb-2 pr-3 font-medium">Статус</th>
                    <th className="pb-2 pr-3 font-medium text-right">Показы</th>
                    <th className="pb-2 pr-3 font-medium text-right">Просмотры</th>
                    <th className="pb-2 pr-3 font-medium text-right">Контакты</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.listing_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 max-w-[220px] truncate" title={item.title || ''}>{item.title || '—'}</td>
                      <td className="py-2 pr-3">{DEAL_LABELS[item.deal || ''] || item.deal || '—'}</td>
                      <td className="py-2 pr-3">
                        {item.is_blocked ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-red-100 text-red-700" title={item.block_type_text || ''}>
                            Заблокировано
                          </span>
                        ) : item.is_archived ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-500">В архиве</span>
                        ) : item.is_published ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-700">Опубликовано</span>
                        ) : item.error ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-red-100 text-red-700" title={item.error}>Ошибка</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-700">На модерации</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{item.shows ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">{item.views ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">{item.contacts ?? '—'}</td>
                      <td className="py-2">
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">
                            <Icon name="ExternalLink" size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
