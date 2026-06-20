import Icon from '@/components/ui/icon';

const CATEGORIES = [
  { id: 'office',       label: 'Офис' },
  { id: 'retail',       label: 'Магазин / торговое' },
  { id: 'warehouse',    label: 'Склад' },
  { id: 'restaurant',   label: 'Общепит / кафе / ресторан' },
  { id: 'hotel',        label: 'Гостиница' },
  { id: 'business',     label: 'Готовый бизнес' },
  { id: 'gab',          label: 'Готовый арендный бизнес (ГАБ)' },
  { id: 'production',   label: 'Производство' },
  { id: 'land',         label: 'Земельный участок' },
  { id: 'building',     label: 'Отдельно стоящее здание' },
  { id: 'free_purpose', label: 'Помещение свободного назначения' },
  { id: 'car_service',  label: 'Автосервис' },
];

const CONDITIONS = [
  { id: 'new',       label: 'Новое' },
  { id: 'euro',      label: 'Евроремонт' },
  { id: 'good',      label: 'Хорошее' },
  { id: 'cosmetic',  label: 'Требуется косметика' },
  { id: 'rough',     label: 'Без отделки' },
  { id: 'shellcore', label: 'Черновая отделка' },
];

// Точно такой же формат что в ListingRoomFeatures — ключ: значение
export const UTILITIES_MAP = [
  { key: 'Электричество', icon: 'Zap',             options: ['220В', '380В (3 фазы)', 'Генератор', 'Солнечные панели'] },
  { key: 'Вода',          icon: 'Droplets',         options: ['Центральная', 'Скважина', 'Колодец', 'Привозная'] },
  { key: 'Канализация',   icon: 'ArrowDownToLine',  options: ['Центральная', 'Септик', 'Выгребная яма', 'Ливневая'] },
  { key: 'Отопление',     icon: 'Flame',            options: ['Центральное', 'Газовое', 'Электрическое', 'Автономное', 'Печное'] },
  { key: 'Газ',           icon: 'Wind',             options: ['Магистральный', 'Баллонный', 'Отсутствует'] },
  { key: 'Интернет',      icon: 'Wifi',             options: ['Оптоволокно', 'Wi-Fi', 'Кабельный', '4G/5G'] },
  { key: 'Вентиляция',    icon: 'AirVent',          options: ['Приточно-вытяжная', 'Принудительная', 'Естественная'] },
];

interface Props {
  city: string;
  deal: 'sale' | 'rent';
  setDeal: (v: 'sale' | 'rent') => void;
  category: string;
  setCategory: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  area: string;
  setArea: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  condition: string;
  setCondition: (v: string) => void;
  // utilities — Record<key, value>, e.g. { 'Вода': 'Центральная', 'Газ': 'Магистральный' }
  utilities: Record<string, string>;
  setUtilityValue: (key: string, value: string) => void;
  electricityKw: string;
  setElectricityKw: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  showExtra: boolean;
  setShowExtra: (fn: (v: boolean) => boolean) => void;
  floor: string;
  setFloor: (v: string) => void;
  totalFloors: string;
  setTotalFloors: (v: string) => void;
  ceilHeight: string;
  setCeilHeight: (v: string) => void;
  errors: Record<string, string>;
  setErrors: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  inputCls: (field: string) => string;
}

export default function OwnerSubmitStepObject({
  city,
  deal, setDeal,
  category, setCategory,
  address, setAddress,
  area, setArea,
  price, setPrice,
  condition, setCondition,
  utilities, setUtilityValue,
  electricityKw, setElectricityKw,
  description, setDescription,
  showExtra, setShowExtra,
  floor, setFloor,
  totalFloors, setTotalFloors,
  ceilHeight, setCeilHeight,
  errors, setErrors,
  inputCls,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-brand-blue mb-1">
        <Icon name="Building2" size={16} />
        <span className="font-semibold text-sm">Об объекте</span>
      </div>

      {/* Тип сделки */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Тип сделки *</label>
        <div className="grid grid-cols-2 gap-2">
          {[{ id: 'rent', label: 'Аренда', icon: 'Key' }, { id: 'sale', label: 'Продажа', icon: 'Handshake' }].map(d => (
            <button key={d.id} type="button" onClick={() => setDeal(d.id as 'sale' | 'rent')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 font-semibold text-sm transition ${
                deal === d.id ? 'border-brand-blue bg-brand-blue/5 text-brand-blue' : 'border-border hover:border-brand-blue/40'
              }`}>
              <Icon name={d.icon} size={15} /> {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Категория */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Категория объекта *</label>
        <select value={category} onChange={e => { setCategory(e.target.value); setErrors(er => ({ ...er, category: '' })); }}
          className={inputCls('category')}>
          <option value="">— выберите —</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {errors.category && <div className="text-xs text-red-500 mt-1">{errors.category}</div>}
      </div>

      {/* Адрес */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Полный адрес *</label>
        <input value={address} onChange={e => { setAddress(e.target.value); setErrors(er => ({ ...er, address: '' })); }}
          placeholder={`ул. Красная, 1, ${city}`} className={inputCls('address')} />
        {errors.address && <div className="text-xs text-red-500 mt-1">{errors.address}</div>}
      </div>

      {/* Площадь + Цена */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">Площадь, м² *</label>
          <input value={area} onChange={e => { setArea(e.target.value); setErrors(er => ({ ...er, area: '' })); }}
            type="number" min="1" placeholder="100" className={inputCls('area')} />
          {errors.area && <div className="text-xs text-red-500 mt-1">{errors.area}</div>}
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground block mb-1">
            {deal === 'rent' ? 'Аренда, ₽/мес *' : 'Цена, ₽ *'}
          </label>
          <input value={price} onChange={e => { setPrice(e.target.value); setErrors(er => ({ ...er, price: '' })); }}
            type="number" min="1" placeholder="150000" className={inputCls('price')} />
          {errors.price && <div className="text-xs text-red-500 mt-1">{errors.price}</div>}
        </div>
      </div>

      {/* Состояние — обязательное */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Состояние объекта *</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CONDITIONS.map(c => (
            <button key={c.id} type="button" onClick={() => { setCondition(c.id); setErrors(er => ({ ...er, condition: '' })); }}
              className={`py-2 px-2 rounded-xl border-2 text-xs font-semibold transition text-center ${
                condition === c.id
                  ? 'border-brand-blue bg-brand-blue/5 text-brand-blue'
                  : 'border-border hover:border-brand-blue/40 text-foreground'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        {errors.condition && <div className="text-xs text-red-500 mt-1">{errors.condition}</div>}
      </div>

      {/* Коммуникации — дропдауны с конкретными значениями, формат "Ключ: Значение" */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
          Коммуникации * <span className="font-normal opacity-60">(выберите хотя бы одну)</span>
        </label>
        <div className="space-y-1.5">
          {UTILITIES_MAP.map(u => {
            const selected = utilities[u.key] || '';
            const hasValue = !!selected;
            return (
              <div key={u.key}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition ${
                  hasValue ? 'border-emerald-400 bg-emerald-50/60' : 'border-border bg-white'
                }`}>
                <Icon name={u.icon} size={14} className={hasValue ? 'text-emerald-600 shrink-0' : 'text-muted-foreground shrink-0'} />
                <span className={`text-xs font-semibold min-w-[100px] ${hasValue ? 'text-emerald-800' : 'text-foreground'}`}>
                  {u.key}
                </span>
                <select
                  value={selected}
                  onChange={e => {
                    setUtilityValue(u.key, e.target.value);
                    setErrors(er => ({ ...er, utilities: '' }));
                  }}
                  className="flex-1 text-xs px-2 py-1 border border-border rounded-lg bg-white outline-none focus:border-emerald-400"
                >
                  <option value="">— не указано —</option>
                  {u.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {hasValue && <Icon name="Check" size={13} className="text-emerald-500 shrink-0" />}
              </div>
            );
          })}
        </div>
        {errors.utilities && <div className="text-xs text-red-500 mt-1">{errors.utilities}</div>}
      </div>

      {/* Электрическая мощность — обязательное */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Электрическая мощность, кВт *</label>
        <input
          value={electricityKw}
          onChange={e => { setElectricityKw(e.target.value); setErrors(er => ({ ...er, electricityKw: '' })); }}
          type="number" min="0.1" step="0.1" placeholder="15"
          className={inputCls('electricityKw')}
        />
        {errors.electricityKw
          ? <div className="text-xs text-red-500 mt-1">{errors.electricityKw}</div>
          : <div className="text-[11px] text-muted-foreground mt-1">Пример: 15 кВт, 40 кВт (380В — три фазы)</div>
        }
      </div>

      {/* Описание */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground block mb-1">Описание *</label>
        <textarea value={description} onChange={e => { setDescription(e.target.value); setErrors(er => ({ ...er, description: '' })); }}
          rows={3} placeholder="Расскажите об объекте: особенности, что рядом, условия..."
          className={`${inputCls('description')} resize-none`} />
        {errors.description && <div className="text-xs text-red-500 mt-1">{errors.description}</div>}
        <div className="text-[10px] text-muted-foreground mt-0.5 text-right">{description.length}/3000</div>
      </div>

      {/* Дополнительно */}
      <button type="button" onClick={() => setShowExtra(v => !v)}
        className="flex items-center gap-2 text-sm text-brand-blue hover:underline">
        <Icon name={showExtra ? 'ChevronUp' : 'ChevronDown'} size={14} />
        Дополнительно {showExtra ? '' : '(этаж, потолки — необязательно)'}
      </button>

      {showExtra && (
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Этаж</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} type="number" min="1"
              placeholder="2" className={inputCls('floor')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Этажей</label>
            <input value={totalFloors} onChange={e => setTotalFloors(e.target.value)} type="number" min="1"
              placeholder="5" className={inputCls('totalFloors')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Потолки, м</label>
            <input value={ceilHeight} onChange={e => setCeilHeight(e.target.value)} type="number" min="1" step="0.1"
              placeholder="3.2" className={inputCls('ceilHeight')} />
          </div>
        </div>
      )}
    </div>
  );
}
