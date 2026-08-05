import { useEffect, useState } from 'react';
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

export default function XmlMarketFeedCard({ items, load, regenerating, regenerateNow, copy }: Props) {
  // Отдельный YML-фид товаров для Яндекс.Маркета — самостоятельная карточка
  // ниже импорта, не смешана с обычным списком фидов недвижимости.
  const [marketCategoryMap, setMarketCategoryMap] = useState<Record<string, string>>({});
  const [marketSaving, setMarketSaving] = useState(false);
  const [marketCreating, setMarketCreating] = useState(false);
  const [marketCategoriesOpen, setMarketCategoriesOpen] = useState(false);
  const marketFeed = items.find(f => f.format === 'market') || null;

  useEffect(() => {
    if (!marketFeed) return;
    try {
      setMarketCategoryMap(marketFeed.market_category_map ? JSON.parse(marketFeed.market_category_map) : {});
    } catch {
      setMarketCategoryMap({});
    }
  }, [marketFeed?.id, marketFeed?.market_category_map]);

  const createMarketFeed = async () => {
    setMarketCreating(true);
    try {
      await adminApi.createFeed({ name: 'Яндекс.Маркет (товары)', format: 'market', is_active: true });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setMarketCreating(false);
    }
  };

  const saveMarketCategoryMap = async () => {
    if (!marketFeed) return;
    setMarketSaving(true);
    try {
      const cleaned: Record<string, string> = {};
      Object.entries(marketCategoryMap).forEach(([k, v]) => { if (v && v.trim()) cleaned[k] = v.trim(); });
      await adminApi.updateFeed(marketFeed.id, { market_category_map: cleaned });
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setMarketSaving(false);
    }
  };

  const toggleMarketActive = async () => {
    if (!marketFeed) return;
    await adminApi.updateFeed(marketFeed.id, { is_active: !marketFeed.is_active });
    load();
  };

  const delMarketFeed = async () => {
    if (!marketFeed || !confirm('Удалить фид Яндекс.Маркет?')) return;
    await adminApi.deleteFeed(marketFeed.id);
    load();
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <div className="font-display font-700 text-lg">Яндекс.Маркет (товары)</div>
          <div className="text-sm text-muted-foreground">Отдельный YML-фид: объекты выгружаются как товары в кабинет продавца Яндекс.Маркета.</div>
        </div>
        {marketFeed && (
          <div className="flex items-center gap-2">
            <button onClick={toggleMarketActive}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${marketFeed.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-muted hover:bg-muted/70'}`}>
              {marketFeed.is_active ? 'Активен' : 'Выкл'}
            </button>
            <button onClick={delMarketFeed} className="text-red-600 p-1.5">
              <Icon name="Trash2" size={14} />
            </button>
          </div>
        )}
      </div>

      {!marketFeed ? (
        <button onClick={createMarketFeed} disabled={marketCreating}
          className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          <Icon name="Plus" size={14} />
          {marketCreating ? 'Создаём...' : 'Создать фид Яндекс.Маркет'}
        </button>
      ) : (
        <>
          <button onClick={() => setMarketCategoriesOpen(v => !v)}
            className="text-xs text-brand-blue inline-flex items-center gap-1 font-semibold">
            <Icon name={marketCategoriesOpen ? 'ChevronUp' : 'ChevronDown'} size={14} />
            {marketCategoriesOpen ? 'Скрыть категории' : 'Изменить категории'}
          </button>

          {marketCategoriesOpen && (
            <>
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
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
                      className="w-32 px-2 py-1.5 border rounded-lg text-sm"
                      value={marketCategoryMap[slug] || ''}
                      onChange={e => setMarketCategoryMap({ ...marketCategoryMap, [slug]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <button onClick={saveMarketCategoryMap} disabled={marketSaving}
                className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                <Icon name="Save" size={14} />
                {marketSaving ? 'Сохраняем...' : 'Сохранить категории'}
              </button>
            </>
          )}

          <div className="mt-2 flex flex-col gap-2 overflow-hidden">
            {marketFeed.cdn_url ? (
              <>
                <div className="text-xs text-muted-foreground">{timeAgo(marketFeed.last_generated_at)}</div>
                <input readOnly value={marketFeed.cdn_url}
                  className="w-full min-w-0 px-2 py-1 text-xs border rounded bg-white truncate" />
                <div className="flex items-center gap-2">
                  <button onClick={() => copy(marketFeed.cdn_url as string)}
                    className="text-xs px-2 py-1 rounded bg-brand-blue text-white inline-flex items-center gap-1 shrink-0">
                    <Icon name="Copy" size={12} /> Скопировать
                  </button>
                  <a href={marketFeed.cdn_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 inline-flex items-center gap-1 shrink-0">
                    <Icon name="ExternalLink" size={12} /> Открыть
                  </a>
                  <button onClick={regenerateNow} disabled={regenerating}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 inline-flex items-center gap-1 shrink-0 disabled:opacity-50">
                    <Icon name="RefreshCw" size={12} className={regenerating ? 'animate-spin' : ''} />
                    Обновить сейчас
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-amber-600 flex items-center gap-2">
                <Icon name="Clock" size={12} /> Файл ещё не создан
                <button onClick={regenerateNow} disabled={regenerating}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 inline-flex items-center gap-1 disabled:opacity-50">
                  <Icon name="RefreshCw" size={12} className={regenerating ? 'animate-spin' : ''} />
                  Создать сейчас
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
