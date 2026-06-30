import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Listing, PARKING, ENTRANCE, perM2 } from './types';

function formatPriceDisplay(val: number | string | undefined): string {
  if (!val && val !== 0) return '';
  const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val;
  if (isNaN(num)) return '';
  return num.toLocaleString('ru');
}

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function ListingEditorPriceSection({ editing, setEditing, errors = {}, setErrors }: Props) {
  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const [priceDisplay, setPriceDisplay] = useState(() => formatPriceDisplay(editing.price));

  useEffect(() => {
    setPriceDisplay(formatPriceDisplay(editing.price));
  }, [editing.price]);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const num = raw ? parseInt(raw, 10) : 0;
    setPriceDisplay(raw ? num.toLocaleString('ru') : '');
    setEditing({ ...editing, price: num || 0 });
    setErrors?.(v => ({ ...v, price: false }));
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Banknote" size={12} className="text-emerald-500" />Цена, ₽ *
          </label>
          <input
            type="text"
            inputMode="numeric"
            className={`w-full px-3 py-2 border rounded-lg font-mono tracking-wide ${err('price')}`}
            placeholder="1 500 000"
            value={priceDisplay}
            onChange={handlePriceChange}
          />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Maximize2" size={12} className="text-brand-blue" />Площадь, м² *
          </label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('area')}`}
            value={editing.area || ''} onChange={e => { setEditing({ ...editing, area: +e.target.value }); setErrors?.(v => ({ ...v, area: false })); }} />
          {editing.category === 'land' && editing.area ? (
            <div className="text-[11px] text-muted-foreground mt-1">
              ≈ {(+editing.area / 100).toLocaleString('ru', { maximumFractionDigits: 2 })} соток
            </div>
          ) : null}
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Tag" size={12} className="text-violet-500" />Единица цены
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.price_unit || 'total'}
            onChange={e => setEditing({ ...editing, price_unit: e.target.value })}>
            <option value="total">За весь объект</option>
            <option value="m2">За м²</option>
            <option value="sotka">За сотку</option>
          </select>
        </div>
      </div>

      {/* Площадь участка + Высота потолка + Эл. мощность — одна строка */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Trees" size={12} className="text-green-500" />Площадь участка, сот.
          </label>
          <input type="number" step="0.01" min="0" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 12.5"
            value={editing.land_area ?? ''}
            onChange={e => setEditing({ ...editing, land_area: e.target.value === '' ? null : +e.target.value })} />
          {editing.land_area ? (
            <div className="text-[11px] text-muted-foreground mt-1">
              ≈ {(+editing.land_area * 100).toLocaleString('ru')} м²
            </div>
          ) : null}
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="MoveVertical" size={12} className="text-sky-500" />Высота потолка, м
          </label>
          <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 3.2"
            value={editing.ceiling_height ?? ''}
            onChange={e => setEditing({ ...editing, ceiling_height: e.target.value === '' ? null : +e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Zap" size={12} className="text-yellow-500" />Эл. мощность, кВт
          </label>
          <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 15"
            value={editing.electricity_kw ?? ''}
            onChange={e => setEditing({ ...editing, electricity_kw: e.target.value === '' ? null : +e.target.value })} />
        </div>
      </div>

      {editing.price && editing.area ? (
        <div className="text-sm bg-muted/40 rounded-lg p-3">
          За м²: <b>{perM2(+editing.price, +editing.area).toLocaleString('ru')} ₽</b>
          {editing.price_unit === 'total' && ' (рассчитано из цены за объект)'}
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Layers" size={12} className="text-brand-blue" />Этаж{editing.category === 'office' ? ' *' : ''}
          </label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('floor')}`}
            value={editing.floor ?? ''} onChange={e => { setEditing({ ...editing, floor: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, floor: false })); }} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Building" size={12} className="text-slate-500" />Этажность{editing.category === 'office' ? ' *' : ''}
          </label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('total_floors')}`}
            value={editing.total_floors ?? ''} onChange={e => { setEditing({ ...editing, total_floors: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, total_floors: false })); }} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="LayoutGrid" size={12} className="text-violet-400" />Комнат
          </label>
          <input type="number" min={0} max={99} className="w-full px-3 py-2 border rounded-lg"
            placeholder="—"
            value={(editing as Record<string,unknown>).rooms != null ? String((editing as Record<string,unknown>).rooms) : ''}
            onChange={e => setEditing({ ...editing, rooms: e.target.value === '' ? null : +e.target.value } as typeof editing)} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="ParkingSquare" size={12} className="text-sky-600" />Парковка
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.parking || 'none'}
            onChange={e => setEditing({ ...editing, parking: e.target.value })}>
            {PARKING.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="DoorOpen" size={12} className="text-orange-500" />Вход
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.entrance || 'street'}
            onChange={e => setEditing({ ...editing, entrance: e.target.value })}>
            {ENTRANCE.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div data-field-error={errors.broker_commission ? 'true' : undefined}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Icon name="Percent" size={12} className="text-amber-500" />Комиссия брокера *
          </label>
          <input type="text" className={`w-full px-3 py-2 border rounded-lg ${err('broker_commission')}`}
            placeholder="напр. 3% или 50 000 ₽"
            value={(editing as Record<string,unknown>).broker_commission as string || ''}
            onChange={e => { setEditing({ ...editing, broker_commission: e.target.value } as typeof editing); setErrors?.(v => ({ ...v, broker_commission: false })); }} />
        </div>
      </div>
    </>
  );
}