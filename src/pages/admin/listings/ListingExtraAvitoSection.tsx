import Icon from '@/components/ui/icon';
import { Listing, BUILDING_TYPES, DEPOSIT_MONTHS, ADDITIONAL_CATEGORIES_MAP, ADDITIONAL_CATEGORIES_MAX } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  err: (field: string) => string;
  errWrap: (field: string) => { 'data-field-error'?: 'true' };
  clearErr: (field: string) => void;
}

export default function ListingExtraAvitoSection({ editing, setEditing, err, errWrap, clearErr }: Props) {
  return (
    <>
    {/* ─── Параметры для Авито ─── */}
    {editing.export_avito && (
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="ShoppingBag" size={15} className="text-brand-blue" />
          Дополнительные параметры для Авито
          <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">обязательны при выгрузке на Авито</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0"><Icon name="Hash" size={11} className="text-green-600" /></span>Номер объявления на Авито (AvitoId)
            </label>
            <input type="number" className="w-full px-3 py-2 border rounded-lg"
              placeholder="оставьте пустым — объявление разместится как новое"
              value={editing.avito_ad_id ?? ''}
              onChange={e => setEditing({ ...editing, avito_ad_id: e.target.value === '' ? null : +e.target.value })} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Если удалить номер — на Авито объявление разместится заново, а не продлится
            </div>
          </div>
          <div {...errWrap('building_type')}>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"><Icon name="Landmark" size={11} className="text-indigo-600" /></span>Тип здания *
            </label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('building_type')}`}
              value={editing.building_type || ''}
              onChange={e => { setEditing({ ...editing, building_type: e.target.value || null }); clearErr('building_type'); }}>
              <option value="">— Не выбрано —</option>
              {BUILDING_TYPES.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}
            </select>
          </div>
          <div {...errWrap('has_vat')}>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0"><Icon name="Receipt" size={11} className="text-rose-600" /></span>НДС *
            </label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('has_vat')}`}
              value={editing.has_vat === true ? 'yes' : editing.has_vat === false ? 'no' : ''}
              onChange={e => { setEditing({ ...editing, has_vat: e.target.value === '' ? null : e.target.value === 'yes' }); clearErr('has_vat'); }}>
              <option value="">— Не выбрано —</option>
              <option value="yes">Да</option>
              <option value="no">Нет</option>
            </select>
          </div>
          {editing.deal === 'rent' && (
            <div {...errWrap('deposit_months')}>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><Icon name="Wallet" size={11} className="text-amber-600" /></span>Залог *
              </label>
              <select className={`w-full px-3 py-2 border rounded-lg ${err('deposit_months')}`}
                value={editing.deposit_months || ''}
                onChange={e => { setEditing({ ...editing, deposit_months: e.target.value || null }); clearErr('deposit_months'); }}>
                <option value="">— Не выбрано —</option>
                {DEPOSIT_MONTHS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </div>
          )}
        </div>
        {!!ADDITIONAL_CATEGORIES_MAP[editing.category || '']?.length && (
          <div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <span className="w-5 h-5 rounded-full bg-fuchsia-100 flex items-center justify-center flex-shrink-0"><Icon name="Tags" size={11} className="text-fuchsia-600" /></span>
              Доп. категория (для Авито, не более {ADDITIONAL_CATEGORIES_MAX})
            </label>
            <div className="flex flex-wrap gap-2">
              {ADDITIONAL_CATEGORIES_MAP[editing.category || ''].map(([value, label]) => {
                const cur = editing.additional_categories
                  ? editing.additional_categories.split('|').map(s => s.trim()).filter(Boolean)
                  : [];
                const checked = cur.includes(value);
                const toggle = () => {
                  let next: string[];
                  if (checked) {
                    next = cur.filter(v => v !== value);
                  } else {
                    if (cur.length >= ADDITIONAL_CATEGORIES_MAX) return;
                    next = [...cur, value];
                  }
                  setEditing({ ...editing, additional_categories: next.join('|') || null });
                };
                return (
                  <label key={value} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition ${checked ? 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700' : 'border-border hover:bg-muted/50'}`}>
                    <input type="checkbox" className="hidden" checked={checked} onChange={toggle} />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-4 pt-1">
          {editing.deal === 'sale' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.is_auction}
                  onChange={e => setEditing({ ...editing, is_auction: e.target.checked })} />
                Аукцион
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.is_share_sale}
                  onChange={e => setEditing({ ...editing, is_share_sale: e.target.checked })} />
                Продажа доли
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.is_assignment}
                  onChange={e => setEditing({ ...editing, is_assignment: e.target.checked })} />
                Это переуступка права аренды
              </label>
            </>
          )}
          {editing.deal === 'rent' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.rent_holidays}
                  onChange={e => setEditing({ ...editing, rent_holidays: e.target.checked })} />
                Арендные каникулы
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.avito_utilities_included}
                  onChange={e => setEditing({ ...editing, avito_utilities_included: e.target.checked })} />
                Эксплуатационные расходы включены
              </label>
            </>
          )}
        </div>

        {/* ─── Переуступка права аренды ─── */}
        {editing.deal === 'sale' && editing.is_assignment && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Icon name="FileSignature" size={13} className="text-brand-blue" />
              Условия переуступки
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0"><Icon name="DoorOpen" size={11} className="text-teal-600" /></span>Помещение сдано
                </label>
                <select className="w-full px-3 py-2 border rounded-lg"
                  value={editing.rented_out === true ? 'yes' : editing.rented_out === false ? 'no' : ''}
                  onChange={e => setEditing({ ...editing, rented_out: e.target.value === '' ? null : e.target.value === 'yes' })}>
                  <option value="">— Не выбрано —</option>
                  <option value="yes">Да</option>
                  <option value="no">Нет</option>
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-fuchsia-100 flex items-center justify-center flex-shrink-0"><Icon name="User" size={11} className="text-fuchsia-600" /></span>Арендатор
                </label>
                <input type="text" className="w-full px-3 py-2 border rounded-lg"
                  placeholder='магазин «Продукты»'
                  value={editing.tenant_name || ''}
                  onChange={e => setEditing({ ...editing, tenant_name: e.target.value || null })} />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0"><Icon name="Wallet" size={11} className="text-emerald-600" /></span>Месячный платёж, ₽
                </label>
                <input type="number" min={0} className="w-full px-3 py-2 border rounded-lg"
                  placeholder="200 000"
                  value={editing.monthly_rent ?? ''}
                  onChange={e => setEditing({ ...editing, monthly_rent: e.target.value === '' ? null : +e.target.value })} />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><Icon name="CalendarDays" size={11} className="text-brand-blue" /></span>Дата окончания договора
                </label>
                <input type="date" className="w-full px-3 py-2 border rounded-lg"
                  value={editing.contract_end_date || ''}
                  onChange={e => setEditing({ ...editing, contract_end_date: e.target.value || null })} />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><Icon name="TrendingUp" size={11} className="text-amber-600" /></span>Годовая индексация платежа, %
                </label>
                <input type="number" min={0} max={100} step={0.1} className="w-full px-3 py-2 border rounded-lg"
                  placeholder="напр. 5"
                  value={editing.rent_index_pct ?? ''}
                  onChange={e => setEditing({ ...editing, rent_index_pct: e.target.value === '' ? null : +e.target.value })} />
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </>
  );
}
