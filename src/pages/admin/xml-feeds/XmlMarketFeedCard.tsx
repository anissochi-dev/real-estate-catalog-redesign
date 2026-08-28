import { useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { F, LISTING_CATEGORIES, timeAgo } from './shared';

interface Props {
  items: F[];
  load: () => void;
  regenerating: boolean;
  regenerateNow: () => void;
  copy: (text: string) => void;
}

// Отдельная карточка YML-фидов товаров для Яндекс.Маркета — не смешана с обычным
// списком фидов недвижимости. Поддерживает НЕСКОЛЬКО market-фидов одновременно
// (например «Яндекс.Маркет (товары)» и его копию «YML» под другую площадку) —
// каждый со своим набором категорий и своей ссылкой.
export default function XmlMarketFeedCard({ items, load, regenerating, regenerateNow, copy }: Props) {
  const marketFeeds = items.filter(f => f.format === 'market');
  const [creating, setCreating] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const createMarketFeed = async () => {
    if (!newName.trim()) { alert('Введите название фида'); return; }
    setCreating(true);
    try {
      // При создании нового YML-фида копируем ID категорий из уже существующего
      // фида (если он есть) — пользователю не нужно вбивать их заново вручную.
      let market_category_map: Record<string, string> | undefined;
      if (marketFeeds.length > 0) {
        try { market_category_map = marketFeeds[0].market_category_map ? JSON.parse(marketFeeds[0].market_category_map) : undefined; } catch { /* ignore */ }
      }
      await adminApi.createFeed({ name: newName.trim(), format: 'market', is_active: true, ...(market_category_map ? { market_category_map } : {}) });
      setAddingOpen(false);
      setNewName('');
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
          <div className="font-display font-700 text-lg">Яндекс.Маркет (товары)</div>
          <div className="text-sm text-muted-foreground">YML-фиды: объекты выгружаются как товары в кабинет продавца Яндекс.Маркета. Можно завести несколько фидов под разные площадки.</div>
        </div>
        {!addingOpen && (
          <button onClick={() => { setAddingOpen(true); setNewName(marketFeeds.length === 0 ? 'Яндекс.Маркет (товары)' : ''); }}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 shrink-0">
            <Icon name="Plus" size={14} /> Добавить YML-фид
          </button>
        )}
      </div>

      {addingOpen && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
          <input
            className="min-w-0 flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
            placeholder="Название фида, например: Яндекс.Маркет, YML для Х"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <button onClick={createMarketFeed} disabled={creating}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 shrink-0">
            {creating ? 'Создаём...' : 'Создать'}
          </button>
          <button onClick={() => { setAddingOpen(false); setNewName(''); }}
            className="px-3 py-2 rounded-xl text-sm bg-muted shrink-0">
            Отмена
          </button>
        </div>
      )}

      {marketFeeds.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-2">Пока нет ни одного YML-фида.</div>
      ) : (
        <div className="space-y-3">
          {marketFeeds.map(feed => (
            <MarketFeedRow key={feed.id} feed={feed} load={load} regenerating={regenerating}
              regenerateNow={regenerateNow} copy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketFeedRow({ feed, load, regenerating, regenerateNow, copy }: {
  feed: F; load: () => void; regenerating: boolean; regenerateNow: () => void; copy: (text: string) => void;
}) {
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>(() => {
    try { return feed.market_category_map ? JSON.parse(feed.market_category_map) : {}; } catch { return {}; }
  });
  const [saving, setSaving] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(feed.name);
  const [savingName, setSavingName] = useState(false);
  const [maxListings, setMaxListings] = useState<number | ''>(feed.max_listings ?? '');
  const [customPhone, setCustomPhone] = useState(feed.custom_phone ?? '');
  const [savingSettings, setSavingSettings] = useState(false);

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

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await adminApi.updateFeed(feed.id, {
        max_listings: maxListings === '' ? null : Number(maxListings),
        custom_phone: customPhone.trim() || null,
      });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveCategoryMap = async () => {
    setSaving(true);
    try {
      const cleaned: Record<string, string> = {};
      Object.entries(categoryMap).forEach(([k, v]) => { if (v && v.trim()) cleaned[k] = v.trim(); });
      await adminApi.updateFeed(feed.id, { market_category_map: cleaned });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
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

      <button onClick={() => setCategoriesOpen(v => !v)}
        className="text-xs text-brand-blue inline-flex items-center gap-1 font-semibold">
        <Icon name={categoriesOpen ? 'ChevronUp' : 'ChevronDown'} size={14} />
        {categoriesOpen ? 'Скрыть категории' : 'Изменить категории'}
      </button>

      {categoriesOpen && (
        <>
          <div className="text-xs text-muted-foreground bg-white rounded-lg px-3 py-2">
            Для каждой категории укажите номер категории (market_category_id) из вашего кабинета продавца на Яндекс.Маркете — без номера объекты этой категории не попадут в фид.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LISTING_CATEGORIES.map(([slug, label]) => (
              <div key={slug} className="flex items-center gap-2">
                <span className="text-sm flex-1 min-w-0 truncate">{label}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="ID категории"
                  className="w-32 px-2 py-1.5 border rounded-lg text-sm bg-white"
                  value={categoryMap[slug] || ''}
                  onChange={e => setCategoryMap({ ...categoryMap, [slug]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <button onClick={saveCategoryMap} disabled={saving}
            className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            <Icon name="Save" size={14} />
            {saving ? 'Сохраняем...' : 'Сохранить категории'}
          </button>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Максимум объектов в фиде</label>
          <input type="number" min={1} className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
            placeholder="Без ограничений"
            value={maxListings}
            onChange={e => setMaxListings(e.target.value ? Number(e.target.value) : '')} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Подменный телефон</label>
          <input type="tel" className="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
            placeholder="+7 900 000-00-00"
            value={customPhone}
            onChange={e => setCustomPhone(e.target.value)} />
        </div>
      </div>
      <button onClick={saveSettings} disabled={savingSettings}
        className="text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 inline-flex items-center gap-1.5 disabled:opacity-50">
        <Icon name="Save" size={13} />
        {savingSettings ? 'Сохраняем...' : 'Сохранить настройки'}
      </button>

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