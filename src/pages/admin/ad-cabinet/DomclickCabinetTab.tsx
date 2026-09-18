import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import PlatformIcon from '@/components/admin/PlatformIcon';
import { DOMCLICK_API_URL, DOMCLICK_STATUS_STYLES, DomclickData } from './types';

const DEAL_LABELS: Record<string, string> = { sale: 'Продажа', rent: 'Аренда' };

export default function DomclickCabinetTab() {
  const [data, setData] = useState<DomclickData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = (sync = false) => {
    if (sync) setSyncing(true); else setLoading(true);
    const url = sync ? `${DOMCLICK_API_URL}&sync=1` : DOMCLICK_API_URL;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
      })
      .catch(() => setError('Не удалось подключиться к ДомКлик'))
      .finally(() => { setLoading(false); setSyncing(false); });
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('ru');

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
        <div className="font-semibold text-foreground">{isSetup ? 'ДомКлик не подключён' : 'Ошибка подключения'}</div>
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
  const { last_sync, items = [] } = data;
  const syncError = last_sync?.error;

  const totalViews = items.reduce((a, i) => a + (i.views || 0), 0);
  const totalPhoneShows = items.reduce((a, i) => a + (i.phone_shows || 0), 0);
  const totalSearchShows = items.reduce((a, i) => a + (i.search_shows || 0), 0);
  const totalChats = items.reduce((a, i) => a + (i.chats_total || 0), 0);
  const totalChatsAnswered = items.reduce((a, i) => a + (i.chats_answered || 0), 0);
  const totalFavorites = items.reduce((a, i) => a + (i.favorites || 0), 0);
  const publishedCount = items.filter(i => i.status === 'Опубликовано').length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <PlatformIcon platform="domclick" icon="MousePointer" size={20} className="text-blue-600" />
              Кабинет ДомКлик
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
          <div className="text-xs text-muted-foreground max-w-sm">
            Проверьте правильность Токена и ID компании в Настройках → Интеграции → Площадки
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(items.length)}</div>
              <div className="text-xs text-muted-foreground">Объявлений</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold text-emerald-600">{fmt(publishedCount)}</div>
              <div className="text-xs text-muted-foreground">Опубликовано</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(totalViews)}</div>
              <div className="text-xs text-muted-foreground">Просмотров карточки</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(totalSearchShows)}</div>
              <div className="text-xs text-muted-foreground">Показов в поиске</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(totalPhoneShows)}</div>
              <div className="text-xs text-muted-foreground">Показов телефона</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(totalChats)}</div>
              <div className="text-xs text-muted-foreground">Чатов ({fmt(totalChatsAnswered)} отвечено)</div>
            </div>
            <div className="bg-white rounded-xl border border-border p-3">
              <div className="text-xl font-bold">{fmt(totalFavorites)}</div>
              <div className="text-xs text-muted-foreground">В избранном</div>
            </div>
          </div>

          {items.some(i => !i.listing_id) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <Icon name="Info" size={14} className="shrink-0 mt-0.5" />
              Часть объявлений не удалось сопоставить с объектами сайта — они заведены вручную в кабинете ДомКлик, а не через XML-выгрузку.
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
                    <th className="text-right px-3 py-2.5 font-semibold">Показы поиск</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Показ телефона</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Чаты</th>
                    <th className="text-right px-3 py-2.5 font-semibold">Избранное</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const statusCls = (item.status && DOMCLICK_STATUS_STYLES[item.status]) || 'bg-muted text-muted-foreground';
                    return (
                      <tr key={item.offer_id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2.5">
                          {item.title ? (
                            <div>
                              <div className="font-medium max-w-[220px] truncate" title={item.title}>{item.title}</div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>{DEAL_LABELS[item.deal || ''] || item.deal || ''}</span>
                                {item.domclick_link && (
                                  <>
                                    {item.deal && <span className="text-muted-foreground/40">·</span>}
                                    <a href={item.domclick_link} target="_blank" rel="noreferrer" className="text-brand-blue underline">
                                      Открыть на ДомКлик
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-muted-foreground italic">Не привязан к сайту</div>
                              {item.domclick_link && (
                                <a href={item.domclick_link} target="_blank" rel="noreferrer" className="text-xs text-brand-blue underline">
                                  Открыть на ДомКлик
                                </a>
                              )}
                            </div>
                          )}
                          {(item.moderation_reason || item.errors) && (
                            <div className="text-[11px] text-red-600 mt-0.5" title={item.moderation_comment || item.errors || ''}>
                              {item.moderation_reason || item.errors}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
                            {item.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{fmt(item.views)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(item.search_shows)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(item.phone_shows)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {fmt(item.chats_total)}
                          {!!item.chats_unanswered && (
                            <span className="text-[10px] text-red-600 ml-1">({item.chats_unanswered} без ответа)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">{fmt(item.favorites)}</td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                        Нет объявлений в кабинете ДомКлик
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}