import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { YoulaData } from './types';

interface Props {
  data: YoulaData;
}

export default function YoulaChannelsPanel({ data }: Props) {
  const [showFeed, setShowFeed] = useState(false);
  const audit = data.channel_audit;
  const feed = data.feed;
  const feedItems = data.feed_items || [];
  const total = (data.channels?.feed || 0) + (data.channels?.api || 0);

  return (
    <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon name="FileCode" size={16} className="text-brand-blue" />
          Выгрузка на Юлу через XML-файл
        </h3>
        {audit && (
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${audit.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <Icon name={audit.ok ? 'ShieldCheck' : 'ShieldAlert'} size={13} />
            {audit.ok ? 'Сверка: дублей нет' : `Сверка: дублей ${audit.conflicts.length}`}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-border p-3 text-xs">
        <div className="text-xl font-bold text-foreground">{total}</div>
        <div className="text-muted-foreground">объектов в файле</div>
        <div className="mt-1 text-muted-foreground">
          {feed?.is_active ? 'Файл обновляется автоматически' : 'Фид выключен'}
          {feed?.last_generated_at && ` · собран ${new Date(feed.last_generated_at).toLocaleString('ru')}`}
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
        Объекты с галочкой «Юла» попадают в файл автоматически. Через API объявления больше не создаются и не обновляются; статистика и статус модерации из API не запрашиваются.
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
                <div key={f.id} className="py-1.5 truncate" title={f.title || ''}>
                  <span className="text-muted-foreground mr-1">№{f.id}</span>{f.title || '—'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
