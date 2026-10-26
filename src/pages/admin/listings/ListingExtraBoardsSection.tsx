import Icon from '@/components/ui/icon';
import { Listing, BUILDING_CLASSES, PROPERTY_RIGHTS, OFFICE_LAYOUTS } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  err: (field: string) => string;
  errWrap: (field: string) => { 'data-field-error'?: 'true' };
  clearErr: (field: string) => void;
}

export default function ListingExtraBoardsSection({ editing, setEditing, err, errWrap, clearErr }: Props) {
  return (
    <>
    {/* ─── Параметры для досок ─── */}
    <div className="space-y-3 pt-1">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Icon name="Share2" size={15} className="text-brand-blue" />
        Параметры для досок объявлений
        <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Яндекс / Авито / ЦИАН</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div {...errWrap('building_class')}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><Icon name="Award" size={11} className="text-amber-600" /></span>Класс здания *
          </label>
          <select className={`w-full px-3 py-2 border rounded-lg ${err('building_class')}`}
            value={editing.building_class || ''}
            onChange={e => { setEditing({ ...editing, building_class: e.target.value || null }); clearErr('building_class'); }}>
            <option value="">— Не выбрано —</option>
            {BUILDING_CLASSES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
          </select>
        </div>
        <div {...errWrap('building_year')}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="CalendarDays" size={11} className="text-brand-blue" /></span>Год постройки *
          </label>
          <input type="number" min={1900} max={2030} className={`w-full px-3 py-2 border rounded-lg ${err('building_year')}`}
            placeholder="напр. 2005"
            value={editing.building_year ?? ''}
            onChange={e => { setEditing({ ...editing, building_year: e.target.value === '' ? null : +e.target.value }); clearErr('building_year'); }} />
        </div>
        <div {...errWrap('property_rights')}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><Icon name="ShieldCheck" size={11} className="text-emerald-700" /></span>Права на объект *
          </label>
          <select className={`w-full px-3 py-2 border rounded-lg ${err('property_rights')}`}
            value={editing.property_rights || ''}
            onChange={e => { setEditing({ ...editing, property_rights: e.target.value || null }); clearErr('property_rights'); }}>
            <option value="">— Не выбрано —</option>
            {PROPERTY_RIGHTS.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
          </select>
        </div>
        {editing.category === 'office' && (
          <div {...errWrap('office_layout')}>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Icon name="LayoutGrid" size={11} className="text-violet-600" /></span>Планировка *
            </label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('office_layout')}`}
              value={editing.office_layout || ''}
              onChange={e => { setEditing({ ...editing, office_layout: e.target.value || null }); clearErr('office_layout'); }}>
              <option value="">— Не выбрано —</option>
              {OFFICE_LAYOUTS.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0"><Icon name="ArrowUpDown" size={11} className="text-cyan-600" /></span>Пассажирские лифты
          </label>
          <input type="number" min={0} max={20} className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 2"
            value={editing.passenger_lifts ?? ''}
            onChange={e => setEditing({ ...editing, passenger_lifts: e.target.value === '' ? null : +e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0"><Icon name="PackageSearch" size={11} className="text-orange-600" /></span>Грузовые лифты
          </label>
          <input type="number" min={0} max={20} className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 1"
            value={editing.cargo_lifts ?? ''}
            onChange={e => setEditing({ ...editing, cargo_lifts: e.target.value === '' ? null : +e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon name="SplitSquareHorizontal" size={11} className="text-slate-600" /></span>Мин. площадь нарезки, м²
          </label>
          <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg"
            placeholder="если делится на части"
            value={editing.min_area ?? ''}
            onChange={e => setEditing({ ...editing, min_area: e.target.value === '' ? null : +e.target.value })} />
        </div>
      </div>
    </div>

    {/* ─── XML фиды ─── */}
    <div className="space-y-2 border-t border-border pt-4">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Icon name="FileCode" size={15} className="text-brand-blue" />
        Выгрузка в XML фиды
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.export_yandex}
            onChange={e => setEditing({ ...editing, export_yandex: e.target.checked })} />
          Яндекс.Недвижимость
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.export_avito}
            onChange={e => setEditing({ ...editing, export_avito: e.target.checked })} />
          Авито
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.export_cian}
            onChange={e => setEditing({ ...editing, export_cian: e.target.checked })} />
          ЦИАН
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.export_youla}
            onChange={e => setEditing({ ...editing, export_youla: e.target.checked })} />
          Юла
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.export_domclick}
            onChange={e => setEditing({ ...editing, export_domclick: e.target.checked })} />
          ДомКлик
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editing.export_other !== false}
            onChange={e => setEditing({ ...editing, export_other: e.target.checked })} />
          Разное <span className="text-[10px] text-muted-foreground font-normal">(доп. площадки, вкл. по умолчанию)</span>
        </label>
      </div>
    </div>
    </>
  );
}
