import Icon from '@/components/ui/icon';
import { Listing, detectVideoType, BUILDING_CLASSES, PROPERTY_RIGHTS, LAND_STATUSES, FINISHING } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
}

export default function ListingExportFields({ editing, setEditing }: Props) {
  return (
    <>
      {/* Метро */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="Train" size={15} className="text-brand-blue" />
          Транспортная доступность
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Ближайшая станция метро</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Площадь Революции»"
              value={editing.subway_station || ''}
              onChange={e => setEditing({ ...editing, subway_station: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Расстояние до метро, мин пешком</label>
            <input type="number" min={1} max={60} className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 5"
              value={editing.subway_distance ?? ''}
              onChange={e => setEditing({ ...editing, subway_distance: e.target.value === '' ? null : +e.target.value })} />
          </div>
        </div>
      </div>

      {/* Дополнительные параметры для досок объявлений */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="Share2" size={15} className="text-brand-blue" />
          Параметры для досок объявлений
          <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Яндекс / Авито / ЦИАН</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Отделка (для досок)</label>
            <select className="w-full px-3 py-2 border rounded-lg"
              value={editing.finishing || ''}
              onChange={e => setEditing({ ...editing, finishing: e.target.value || null })}>
              <option value="">— Не указано —</option>
              {FINISHING.map(f => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Класс здания</label>
            <select className="w-full px-3 py-2 border rounded-lg"
              value={editing.building_class || ''}
              onChange={e => setEditing({ ...editing, building_class: e.target.value || null })}>
              <option value="">— Не указано —</option>
              {BUILDING_CLASSES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Год постройки здания</label>
            <input type="number" min={1900} max={2030} className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 2005"
              value={editing.building_year ?? ''}
              onChange={e => setEditing({ ...editing, building_year: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Права на объект</label>
            <select className="w-full px-3 py-2 border rounded-lg"
              value={editing.property_rights || ''}
              onChange={e => setEditing({ ...editing, property_rights: e.target.value || null })}>
              <option value="">— Не указано —</option>
              {PROPERTY_RIGHTS.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Мин. площадь нарезки, м²</label>
            <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg"
              placeholder="если делится на части"
              value={editing.min_area ?? ''}
              onChange={e => setEditing({ ...editing, min_area: e.target.value === '' ? null : +e.target.value })} />
          </div>
          {(editing.category === 'land') && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Площадь участка, сотки</label>
                <input type="number" min={0} step={0.1} className="w-full px-3 py-2 border rounded-lg"
                  placeholder="напр. 15"
                  value={editing.land_area ?? ''}
                  onChange={e => setEditing({ ...editing, land_area: e.target.value === '' ? null : +e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Назначение земли</label>
                <select className="w-full px-3 py-2 border rounded-lg"
                  value={editing.land_status || ''}
                  onChange={e => setEditing({ ...editing, land_status: e.target.value || null })}>
                  <option value="">— Не указано —</option>
                  {LAND_STATUSES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_furniture}
              onChange={e => setEditing({ ...editing, has_furniture: e.target.checked })} />
            <span className="text-sm">Мебель есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_equipment}
              onChange={e => setEditing({ ...editing, has_equipment: e.target.checked })} />
            <span className="text-sm">Оборудование есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.is_apartments}
              onChange={e => setEditing({ ...editing, is_apartments: e.target.checked })} />
            <span className="text-sm">Апартаменты</span>
          </label>
        </div>
      </div>

      {/* Видео */}
      <div>
        <label className="text-xs text-muted-foreground">Видео (VK Видео или RuTube URL)</label>
        <input className="w-full px-3 py-2 border rounded-lg" placeholder="https://vk.com/video... или https://rutube.ru/video/..."
          value={editing.video_url || ''} onChange={e => setEditing({ ...editing, video_url: e.target.value })} />
        {editing.video_url && (
          <div className="text-xs text-muted-foreground mt-1">
            Тип: {detectVideoType(editing.video_url) === 'vk' ? 'VK Видео' : detectVideoType(editing.video_url) === 'rutube' ? 'RuTube' : 'Другое'}
          </div>
        )}
      </div>
    </>
  );
}