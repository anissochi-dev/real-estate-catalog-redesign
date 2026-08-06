import Icon from '@/components/ui/icon';
import { F, PLATFORMS } from './shared';

interface Props {
  editing: Partial<F>;
  setEditing: (f: Partial<F> | null) => void;
  save: () => void;
}

export default function XmlFeedEditModal({ editing, setEditing, save }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full">
        <div className="p-5 border-b border-border flex justify-between items-center">
          <div className="font-display font-700 text-lg">
            {editing.id ? 'Редактировать' : 'Новый XML фид'}
          </div>
          <button onClick={() => setEditing(null)}><Icon name="X" size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Название фида</label>
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Например: М2, Яндекс.Недвижимость"
              value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Любое удобное название — можно завести несколько фидов на одну площадку под разные названия.
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Площадка (формат XML)</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={editing.format || 'other'}
              onChange={e => setEditing({ ...editing, format: e.target.value })}>
              {PLATFORMS.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
            </select>
            <div className="text-[11px] text-muted-foreground mt-1">
              Определяет формат XML и какие объекты попадут в фид (по галочкам экспорта в карточке объекта).
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.is_active !== false}
              onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
            Активен
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!editing.use_jpg_photos}
              onChange={e => setEditing({ ...editing, use_jpg_photos: e.target.checked })} />
            Фото в JPG (без водяного знака)
          </label>
          <div className="text-[11px] text-muted-foreground -mt-2">
            Для площадок, которые не принимают WEBP-формат фото (например Akula, 23Estate). Ссылки на фото в фиде заменятся на JPG-копии.
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Максимум объектов в фиде</label>
            <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg"
              placeholder="Без ограничений"
              value={editing.max_listings ?? ''}
              onChange={e => setEditing({ ...editing, max_listings: e.target.value ? Number(e.target.value) : null })} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Для площадок с лимитом (например Doska.ru — 100). В фид попадут только самые свежие объекты — при появлении новых старые автоматически выпадут из выгрузки.
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Подменный телефон</label>
            <input type="tel" className="w-full px-3 py-2 border rounded-lg"
              placeholder="+7 900 000-00-00"
              value={editing.custom_phone ?? ''}
              onChange={e => setEditing({ ...editing, custom_phone: e.target.value || null })} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Если указан — во всех объявлениях этого фида вместо телефона компании (Настройки → Общие) будет показан этот номер. Удобно для отслеживания звонков с конкретной площадки. Если оставить пустым — используется телефон компании.
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-3">
          <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
          <button onClick={save} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}