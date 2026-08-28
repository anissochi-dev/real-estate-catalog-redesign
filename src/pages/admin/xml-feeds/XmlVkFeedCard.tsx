import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { F, timeAgo } from './shared';

interface Props {
  items: F[];
  load: () => void;
  regenerating: boolean;
  regenerateNow: () => void;
  copy: (text: string) => void;
}

// Карточка YML-фидов «Товары» для сообщества ВКонтакте (format='market_vk').
// Поддерживает НЕСКОЛЬКО фидов одновременно (например под разные сообщества) —
// у каждого своё название и свой ID категории VK. В отличие от Яндекс.Маркета,
// у VK нет отдельных категорий под каждый тип коммерческой недвижимости — только
// общая «Коммерческая недвижимость», поэтому вместо 12 полей категорий здесь одно
// поле ID (ключ "*" в market_category_map, он покрывает все объекты сразу).
export default function XmlVkFeedCard({ items, load, regenerating, regenerateNow, copy }: Props) {
  const vkFeeds = items.filter(f => f.format === 'market_vk');
  const [creating, setCreating] = useState(false);

  const createVkFeed = async () => {
    setCreating(true);
    try {
      await adminApi.createFeed({ name: 'VK Товары', format: 'market_vk', is_active: true });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <div className="font-display font-700 text-lg">VK Товары</div>
          <div className="text-sm text-muted-foreground">YML-фиды для витрины «Товары» в сообществе ВКонтакте: Управление → Товары → Импортировать из файла. Можно завести несколько фидов под разные сообщества.</div>
        </div>
        <button onClick={createVkFeed} disabled={creating}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 shrink-0">
          <Icon name="Plus" size={14} />
          {creating ? 'Создаём...' : 'Добавить фид'}
        </button>
      </div>

      {vkFeeds.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-2">Пока нет ни одного VK-фида.</div>
      ) : (
        <div className="space-y-3">
          {vkFeeds.map(feed => (
            <VkFeedRow key={feed.id} feed={feed} load={load} regenerating={regenerating}
              regenerateNow={regenerateNow} copy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}

function VkFeedRow({ feed, load, regenerating, regenerateNow, copy }: {
  feed: F; load: () => void; regenerating: boolean; regenerateNow: () => void; copy: (text: string) => void;
}) {
  const initialCatId = (() => {
    try { return feed.market_category_map ? (JSON.parse(feed.market_category_map)['*'] || '') : ''; } catch { return ''; }
  })();
  const [catId, setCatId] = useState(initialCatId);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(feed.name);
  const [savingName, setSavingName] = useState(false);

  const saveCategoryId = async () => {
    setSaving(true);
    try {
      await adminApi.updateFeed(feed.id, { market_category_map: catId.trim() ? { '*': catId.trim() } : {} });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const saveName = async () => {
    if (!nameDraft.trim()) { alert('Название не может быть пустым'); return; }
    setSavingName(true);
    try {
      await adminApi.updateFeed(feed.id, { name: nameDraft.trim() });
      setRenaming(false);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSavingName(false);
    }
  };

  const toggleActive = async () => {
    await adminApi.updateFeed(feed.id, { is_active: !feed.is_active });
    load();
  };

  const delFeed = async () => {
    if (!confirm(`Удалить фид «${feed.name}»?`)) return;
    await adminApi.deleteFeed(feed.id);
    load();
  };

  return (
    <div className="p-3 bg-muted/30 rounded-lg space-y-2">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 px-2 py-1 border rounded-lg text-sm bg-white"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                autoFocus
              />
              <button onClick={saveName} disabled={savingName}
                className="text-xs px-2 py-1 rounded bg-brand-blue text-white shrink-0 disabled:opacity-50">
                <Icon name="Check" size={13} />
              </button>
              <button onClick={() => { setRenaming(false); setNameDraft(feed.name); }}
                className="text-xs px-2 py-1 rounded bg-muted shrink-0">
                <Icon name="X" size={13} />
              </button>
            </div>
          ) : (
            <div className="font-semibold flex flex-wrap items-center gap-2">
              <span className="break-all">{feed.name}</span>
              <button onClick={() => setRenaming(true)} className="text-muted-foreground hover:text-brand-blue shrink-0">
                <Icon name="Pencil" size={12} />
              </button>
              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${feed.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>
                {feed.is_active ? 'Активен' : 'Выкл'}
              </span>
            </div>
          )}
          <div className="text-xs text-muted-foreground">{timeAgo(feed.last_generated_at)}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={toggleActive} className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70">
            {feed.is_active ? 'Выключить' : 'Включить'}
          </button>
          <button onClick={delFeed} className="text-red-600 p-1.5">
            <Icon name="Trash2" size={14} />
          </button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-white rounded-lg px-3 py-2">
        Укажите ID категории «Коммерческая недвижимость» из настроек товаров вашего сообщества ВКонтакте — без него объекты не попадут в фид.
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm flex-1 min-w-0">ID категории VK</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="например 505"
          className="w-32 px-2 py-1.5 border rounded-lg text-sm bg-white"
          value={catId}
          onChange={e => setCatId(e.target.value)}
        />
        <button onClick={saveCategoryId} disabled={saving}
          className="btn-blue text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0">
          <Icon name="Save" size={13} />
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-hidden">
        {feed.cdn_url ? (
          <>
            <input readOnly value={feed.cdn_url}
              className="w-full min-w-0 px-2 py-1 text-xs border rounded bg-white truncate" />
            <div className="flex items-center gap-2">
              <button onClick={() => copy(feed.cdn_url as string)}
                className="text-xs px-2 py-1 rounded bg-brand-blue text-white inline-flex items-center gap-1 shrink-0">
                <Icon name="Copy" size={12} /> Скопировать
              </button>
              <a href={feed.cdn_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2 py-1 rounded bg-white hover:bg-muted/70 inline-flex items-center gap-1 shrink-0">
                <Icon name="ExternalLink" size={12} /> Открыть
              </a>
              <button onClick={regenerateNow} disabled={regenerating}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-white inline-flex items-center gap-1 shrink-0 disabled:opacity-50">
                <Icon name="RefreshCw" size={12} className={regenerating ? 'animate-spin' : ''} />
                Обновить сейчас
              </button>
            </div>
          </>
        ) : (
          <div className="text-xs text-amber-600 flex items-center gap-2">
            <Icon name="Clock" size={12} /> Файл ещё не создан
            <button onClick={regenerateNow} disabled={regenerating}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-white inline-flex items-center gap-1 disabled:opacity-50">
              <Icon name="RefreshCw" size={12} className={regenerating ? 'animate-spin' : ''} />
              Создать сейчас
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
