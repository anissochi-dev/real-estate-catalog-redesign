import Icon from '@/components/ui/icon';
import { F, PLATFORMS, timeAgo } from './shared';

interface Props {
  items: F[];
  search: string;
  setSearch: (v: string) => void;
  regenerating: boolean;
  regenerateNow: () => void;
  setEditing: (f: Partial<F> | null) => void;
  del: (id: number) => void;
  copy: (text: string) => void;
}

export default function XmlFeedsListCard({
  items, search, setSearch, regenerating, regenerateNow, setEditing, del, copy,
}: Props) {
  // Market-фид показывается в своей отдельной карточке ниже импорта — исключаем
  // его из общего списка обычных фидов недвижимости.
  const filteredItems = items
    .filter(f => f.format !== 'market')
    .filter(f => f.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="font-display font-700 text-lg">XML фиды (экспорт)</div>
        <div className="flex items-center gap-2">
          <button onClick={regenerateNow} disabled={regenerating}
            className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 border border-border hover:bg-muted/50 transition disabled:opacity-50">
            <Icon name="RefreshCw" size={14} className={regenerating ? 'animate-spin' : ''} />
            {regenerating ? 'Обновляю…' : 'Обновить сейчас'}
          </button>
          <button onClick={() => setEditing({ name: '', format: 'other', is_active: true })}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Icon name="Plus" size={14} /> Добавить фид
          </button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-3 bg-muted/30 rounded-lg px-3 py-2">
        Файлы генерируются в готовые ссылки и обновляются автоматически каждые 10 минут (при заходе посетителей на сайт), либо мгновенно по кнопке «Обновить сейчас».
      </div>

      {items.length > 0 && (
        <div className="relative mb-3">
          <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Поиск по названию фида..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      )}

      <div className="space-y-2">
        {filteredItems.length === 0 && search && (
          <div className="text-sm text-muted-foreground text-center py-4">Ничего не найдено по «{search}»</div>
        )}
        {filteredItems.map(f => (
          <div key={f.id} className="p-3 bg-muted/30 rounded-lg">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold flex flex-wrap items-center gap-2">
                  <span className="break-all">{f.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${f.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted'}`}>
                    {f.is_active ? 'Активен' : 'Выкл'}
                  </span>
                  {f.use_jpg_photos && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-blue-100 text-blue-700">
                      JPG-фото
                    </span>
                  )}
                  {!!f.max_listings && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-700">
                      До {f.max_listings} объектов
                    </span>
                  )}
                  {!!f.custom_phone && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-violet-100 text-violet-700 inline-flex items-center gap-1">
                      <Icon name="Phone" size={10} /> {f.custom_phone}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Площадка: {PLATFORMS.find(p => p[0] === f.format)?.[1] || f.format} · {timeAgo(f.last_generated_at)}
                </div>
                <div className="mt-2 flex flex-col gap-2 overflow-hidden">
                  {f.cdn_url ? (
                    <>
                      <input readOnly value={f.cdn_url}
                        className="w-full min-w-0 px-2 py-1 text-xs border rounded bg-white truncate" />
                      <div className="flex items-center gap-2">
                        <button onClick={() => copy(f.cdn_url as string)}
                          className="text-xs px-2 py-1 rounded bg-brand-blue text-white inline-flex items-center gap-1 shrink-0">
                          <Icon name="Copy" size={12} /> Скопировать
                        </button>
                        <a href={f.cdn_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/70 inline-flex items-center gap-1 shrink-0">
                          <Icon name="ExternalLink" size={12} /> Открыть
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-amber-600 flex items-center gap-1">
                      <Icon name="Clock" size={12} /> Файл ещё не создан — нажмите «Обновить сейчас»
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(f)} className="text-brand-blue p-1">
                  <Icon name="Pencil" size={14} />
                </button>
                <button onClick={() => del(f.id)} className="text-red-600 p-1">
                  <Icon name="Trash2" size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        В карточке объекта поставьте галочки «Яндекс / Авито / ЦИАН» — объект попадёт в соответствующий фид.
      </div>
    </div>
  );
}