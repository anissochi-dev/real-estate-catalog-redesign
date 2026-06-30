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
  const unit = editing.price_unit || 'total';
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

  // При смене единицы — пересчитываем цену чтобы она сохранила смысл
  const handleUnitChange = (newUnit: string) => {
    const price = +editing.price || 0;
    const area = +editing.area || 0;
    let newPrice = price;
    if (area > 0 && price > 0) {
      if (unit === 'total' && newUnit === 'm2') {
        // было: за объект → теперь: за м²
        newPrice = Math.round(price / area);
      } else if (unit === 'm2' && newUnit === 'total') {
        // было: за м² → теперь: за объект
        newPrice = Math.round(price * area);
      } else if (unit === 'total' && newUnit === 'sotka') {
        const sotki = area / 100;
        newPrice = sotki > 0 ? Math.round(price / sotki) : price;
      } else if (unit === 'sotka' && newUnit === 'total') {
        const sotki = area / 100;
        newPrice = Math.round(price * sotki);
      } else if (unit === 'm2' && newUnit === 'sotka') {
        newPrice = Math.round(price * 100);
      } else if (unit === 'sotka' && newUnit === 'm2') {
        newPrice = Math.round(price / 100);
      }
    }
    setPriceDisplay(formatPriceDisplay(newPrice));
    setEditing({ ...editing, price_unit: newUnit, price: newPrice });
  };

  // Вычисляем производное значение для показа
  const price = +editing.price || 0;
  const area = +editing.area || 0;
  const derivedTotal = unit === 'm2' && price > 0 && area > 0 ? Math.round(price * area) : null;
  const derivedPerM2 = unit === 'total' && price > 0 && area > 0 ? Math.round(price / area) : null;
  const derivedSotka = unit === 'total' && price > 0 && area > 0 ? Math.round(price / (area / 100)) : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><Icon name="Banknote" size={11} className="text-emerald-600" /></span>
            {unit === 'm2' ? 'Цена за м², ₽ *' : unit === 'sotka' ? 'Цена за сотку, ₽ *' : 'Цена, ₽ *'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            className={`w-full px-3 py-2 border rounded-lg font-mono tracking-wide ${err('price')}`}
            placeholder={unit === 'm2' ? 'напр. 80 000' : unit === 'sotka' ? 'напр. 500 000' : '1 500 000'}
            value={priceDisplay}
            onChange={handlePriceChange}
          />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="Maximize2" size={11} className="text-brand-blue" /></span>Площадь, м² *
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
            <span className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Icon name="Tag" size={11} className="text-violet-600" /></span>Единица цены
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={unit}
            onChange={e => handleUnitChange(e.target.value)}>
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
            <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"><Icon name="Trees" size={11} className="text-green-600" /></span>Площадь участка, сот.
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
            <span className="w-5 h-5 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0"><Icon name="MoveVertical" size={11} className="text-sky-600" /></span>Высота потолка, м
          </label>
          <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 3.2"
            value={editing.ceiling_height ?? ''}
            onChange={e => setEditing({ ...editing, ceiling_height: e.target.value === '' ? null : +e.target.value })} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0"><Icon name="Zap" size={11} className="text-yellow-600" /></span>Эл. мощность, кВт
          </label>
          <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
            placeholder="напр. 15"
            value={editing.electricity_kw ?? ''}
            onChange={e => setEditing({ ...editing, electricity_kw: e.target.value === '' ? null : +e.target.value })} />
        </div>
      </div>

      {price > 0 && area > 0 && (
        <div className="text-sm bg-muted/40 rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-1">
          {unit === 'total' && (
            <>
              <span>За м²: <b>{derivedPerM2?.toLocaleString('ru')} ₽</b></span>
              {editing.category === 'land' && derivedSotka && (
                <span className="text-muted-foreground">За сотку: <b>{derivedSotka.toLocaleString('ru')} ₽</b></span>
              )}
            </>
          )}
          {unit === 'm2' && derivedTotal && (
            <span>Полная стоимость: <b>{derivedTotal.toLocaleString('ru')} ₽</b></span>
          )}
          {unit === 'sotka' && price > 0 && area > 0 && (
            <span>Полная стоимость: <b>{Math.round(price * (area / 100)).toLocaleString('ru')} ₽</b></span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="Layers" size={11} className="text-brand-blue" /></span>Этаж{editing.category === 'office' ? ' *' : ''}
          </label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('floor')}`}
            value={editing.floor ?? ''} onChange={e => { setEditing({ ...editing, floor: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, floor: false })); }} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon name="Building" size={11} className="text-slate-600" /></span>Этажность{editing.category === 'office' ? ' *' : ''}
          </label>
          <input type="number" className={`w-full px-3 py-2 border rounded-lg ${err('total_floors')}`}
            value={editing.total_floors ?? ''} onChange={e => { setEditing({ ...editing, total_floors: e.target.value === '' ? null : +e.target.value }); setErrors?.(v => ({ ...v, total_floors: false })); }} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Icon name="LayoutGrid" size={11} className="text-violet-600" /></span>Комнат
          </label>
          <input type="number" min={0} max={99} className="w-full px-3 py-2 border rounded-lg"
            placeholder="—"
            value={(editing as Record<string,unknown>).rooms != null ? String((editing as Record<string,unknown>).rooms) : ''}
            onChange={e => setEditing({ ...editing, rooms: e.target.value === '' ? null : +e.target.value } as typeof editing)} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0"><Icon name="ParkingSquare" size={11} className="text-sky-700" /></span>Парковка
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.parking || 'none'}
            onChange={e => setEditing({ ...editing, parking: e.target.value })}>
            {PARKING.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0"><Icon name="DoorOpen" size={11} className="text-orange-600" /></span>Вход
          </label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.entrance || 'street'}
            onChange={e => setEditing({ ...editing, entrance: e.target.value })}>
            {ENTRANCE.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
          </select>
        </div>
        <div data-field-error={errors.broker_commission ? 'true' : undefined}>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><Icon name="Percent" size={11} className="text-amber-600" /></span>Комиссия брокера *
          </label>
          <input type="text" className={`w-full px-3 py-2 border rounded-lg ${err('broker_commission')}`}
            placeholder="напр. 3% или 50 000 ₽"
            value={(editing as Record<string,unknown>).broker_commission as string || ''}
            onChange={e => { setEditing({ ...editing, broker_commission: e.target.value } as typeof editing); setErrors?.(v => ({ ...v, broker_commission: false })); }} />
        </div>
      </div>

      {/* ─── Доходность и арендатор ─── */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="TrendingUp" size={15} className="text-brand-blue" />
          Доходность и арендатор
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><Icon name="Wallet" size={11} className="text-emerald-600" /></span>МАП (мес. арендный поток), ₽
            </label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.monthly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, monthly_rent: v, yearly_rent: v ? Math.round(v * 12) : editing.yearly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0"><Icon name="Coins" size={11} className="text-yellow-700" /></span>ГАП (год. арендный поток), ₽
            </label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.yearly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, yearly_rent: v, monthly_rent: v ? Math.round(v / 12) : editing.monthly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="Timer" size={11} className="text-blue-600" /></span>Окупаемость, мес
            </label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="авто, если пусто"
              value={editing.payback ?? ''}
              onChange={e => setEditing({ ...editing, payback: e.target.value === '' ? null : +e.target.value })} />
            {!editing.payback && editing.price && (editing.monthly_rent || editing.profit) ? (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Авто: ~{Math.round(+editing.price / +(editing.monthly_rent || editing.profit || 1))} мес
              </div>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><Icon name="Users" size={11} className="text-violet-600" /></span>Название арендатора (если есть)
            </label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Магнит», «Сбербанк»..."
              value={editing.tenant_name || ''}
              onChange={e => setEditing({ ...editing, tenant_name: e.target.value })} />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0"><Icon name="Percent" size={11} className="text-rose-600" /></span>Индексация аренды, % в год
            </label>
            <input type="number" min="0" max="100" step="0.5" className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 5"
              value={(editing as Record<string,unknown>).rent_index_pct != null ? String((editing as Record<string,unknown>).rent_index_pct) : ''}
              onChange={e => setEditing({ ...editing, rent_index_pct: e.target.value === '' ? null : +e.target.value } as typeof editing)} />
          </div>
        </div>

        {/* Прогноз арендного потока */}
        {editing.monthly_rent && (editing as Record<string,unknown>).rent_index_pct ? (() => {
          const map = editing.monthly_rent!;
          const pct = (editing as Record<string,unknown>).rent_index_pct as number;
          const step = Math.round(map * pct / 100);
          const rows = Array.from({ length: 10 }, (_, i) => {
            const mon = map + step * (i + 1);
            return { year: i + 1, monthly: mon, yearly: mon * 12 };
          });
          return (
            <div className="mt-3 rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                <Icon name="TrendingUp" size={13} className="text-emerald-600" />
                <span className="text-xs font-semibold">Прогноз при индексации {pct}% в год</span>
                <span className="ml-auto text-[11px] text-muted-foreground">Сейчас: {map.toLocaleString('ru')} ₽/мес</span>
              </div>
              <div className="divide-y divide-border">
                {rows.map(r => (
                  <div key={r.year} className="grid grid-cols-3 px-3 py-1.5 text-xs hover:bg-muted/30 transition-colors">
                    <span className="text-muted-foreground">Год {r.year}</span>
                    <span className="font-medium">{r.monthly.toLocaleString('ru')} ₽/мес</span>
                    <span className="text-muted-foreground text-right">{r.yearly.toLocaleString('ru')} ₽/год</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })() : null}
      </div>
    </>
  );
}