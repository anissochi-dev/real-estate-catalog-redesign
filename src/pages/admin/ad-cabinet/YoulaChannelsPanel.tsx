import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { getToken } from '@/lib/adminApi';
import { YoulaData } from './types';

const SET_CHANNEL_URL = 'https://functions.poehali.dev/fd00362c-a377-4d94-816c-c5a4abf087cd?action=youla_set_channel';

interface Props {
  data: YoulaData;
  onChanged: () => void;
}

export default function YoulaChannelsPanel({ data, onChanged }: Props) {
  const [showFeed, setShowFeed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const channels = data.channels || { feed: 0, api: 0 };
  const audit = data.channel_audit;
  const feed = data.feed;
  const feedItems = data.feed_items || [];

  const setChannel = async (id: number, channel: 'feed' | 'api') => {
    const msg = channel === 'api'
      ? `Перевести объект №${id} на API? Он уйдёт из файла — Юла снимет файловое объявление, а через API будет создано новое (новое объявление без истории, пройдёт модерацию).`
      : `Перевести объект №${id} в файл? API-объявление уйдёт в архив, объект попадёт в файл при следующей сборке фидов.`;
    if (!confirm(msg)) return;
    setBusyId(id);
    try {
      const token = getToken();
      const r = await fetch(`${SET_CHANNEL_URL}&token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ listing_id: id, channel }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Ошибка');
      toast.success('Канал изменён');
      onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon name="GitFork" size={16} className="text-brand-blue" />
          Каналы выгрузки на Юлу
        </h3>
        {audit && (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${audit.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <Icon name={audit.ok ? 'ShieldCheck' : 'ShieldAlert'} size={13} />
            {audit.ok ? 'Сверка каналов: дублей нет' : `Сверка каналов: дублей ${audit.conflicts.length}`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border p-3">
          <div className="text-xl font-bold text-foreground">{channels.feed}</div>
          <div className="text-muted-foreground">через XML-файл</div>
          <div className="mt-1 text-muted-foreground">
            {feed?.is_active ? 'Файл обновляется автоматически' : 'Фид выключен'}
            {feed?.last_generated_at && ` · собран ${new Date(feed.last_generated_at).toLocaleString('ru')}`}
          </div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-xl font-bold text-foreground">{channels.api}</div>
          <div className="text-muted-foreground">через API</div>
          <div className="mt-1 text-muted-foreground">Статистика и статус модерации — в таблице ниже</div>
        </div>
      </div>

      {audit && !audit.ok && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
          {audit.conflicts.map(c => (
            <div key={c.id}>
              №{c.id} {c.title ? `«${c.title}»` : ''} — есть и в файле, и живое объявление через API. Ближайшая синхронизация отправит API-объявление в архив.
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Один объект — один канал. Новые объекты с галочкой «Юла» идут через API, канал сам не меняется.
      </p>

      {feedItems.length > 0 && (
        <div>
          <button onClick={() => setShowFeed(v => !v)} className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1">
            <Icon name={showFeed ? 'ChevronUp' : 'ChevronDown'} size={13} />
            {showFeed ? 'Скрыть объекты файла' : `Показать объекты файла (${feedItems.length})`}
          </button>
          {showFeed && (
            <div className="mt-2 max-h-72 overflow-auto divide-y divide-border/50 text-xs">
              {feedItems.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="truncate" title={f.title || ''}>
                    <span className="text-muted-foreground mr-1">№{f.id}</span>{f.title || '—'}
                  </span>
                  <button
                    onClick={() => setChannel(f.id, 'api')}
                    disabled={busyId === f.id}
                    className="shrink-0 text-[11px] px-2 py-0.5 rounded border border-border hover:bg-muted disabled:opacity-50"
                  >
                    Перевести на API
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { SET_CHANNEL_URL };
