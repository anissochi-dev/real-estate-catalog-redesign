import Icon from '@/components/ui/icon';
import { Listing, LandVri, LAND_STATUSES } from './types';

interface UtilityDef { key: string; label: string; icon: string; color: string; bg: string; options: string[] }

const UTILITIES_MAP: UtilityDef[] = [
  { key: 'Вода',               label: 'Вода',               icon: 'Droplets',    color: 'text-sky-500',    bg: 'bg-sky-100',    options: ['Центральная', 'Скважина', 'Колодец', 'Привозная'] },
  { key: 'Канализация',        label: 'Канализация',        icon: 'Waves',       color: 'text-blue-500',   bg: 'bg-blue-100',   options: ['Центральная', 'Септик', 'Выгребная яма', 'Ливневая'] },
  { key: 'Отопление',          label: 'Отопление',          icon: 'Flame',       color: 'text-orange-500', bg: 'bg-orange-100', options: ['Центральное', 'Газовое', 'Электрическое', 'Автономное', 'Печное', 'Тепловой насос'] },
  { key: 'Газ',                label: 'Газ',                icon: 'Fuel',        color: 'text-blue-600',   bg: 'bg-blue-100',   options: ['Магистральный', 'Баллонный', 'Отсутствует'] },
  { key: 'Электричество',      label: 'Электричество',      icon: 'Zap',         color: 'text-yellow-500', bg: 'bg-yellow-100', options: ['220В', '380В (3 фазы)', 'Генератор', 'Солнечные панели'] },
  { key: 'Интернет',           label: 'Интернет',           icon: 'Wifi',        color: 'text-cyan-500',   bg: 'bg-cyan-100',   options: ['Оптоволокно', 'Wi-Fi', 'Кабельный', '4G/5G'] },
  { key: 'Вентиляция',         label: 'Вентиляция',         icon: 'Wind',        color: 'text-slate-500',  bg: 'bg-slate-100',  options: ['Приточно-вытяжная', 'Принудительная', 'Естественная'] },
  { key: 'Кондиционирование',  label: 'Кондиционирование',  icon: 'Thermometer', color: 'text-indigo-500', bg: 'bg-indigo-100', options: ['Сплит-система', 'Центральное', 'Чиллер', 'Отсутствует'] },
  { key: 'Пожарная сигнализация', label: 'Пожарная сигнализация', icon: 'BellRing', color: 'text-red-500', bg: 'bg-red-100',  options: ['Есть', 'Отсутствует'] },
  { key: 'Видеонаблюдение',    label: 'Видеонаблюдение',    icon: 'Camera',      color: 'text-violet-500', bg: 'bg-violet-100', options: ['Есть', 'Отсутствует'] },
];

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  landVri?: LandVri[];
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function ListingRoomFeatures({ editing, setEditing, landVri = [], errors = {}, setErrors }: Props) {
  const isLand = editing.category === 'land';
  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const clearErr = (field: string) => setErrors?.(v => ({ ...v, [field]: false }));
  return (
    <>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Характеристики помещения</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {isLand && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">Категория земли *</label>
                <select className={`w-full px-3 py-2 border rounded-lg ${err('land_status')}`}
                  value={editing.land_status || ''}
                  onChange={e => { setEditing({ ...editing, land_status: e.target.value || null }); clearErr('land_status'); }}>
                  <option value="">— Не указано —</option>
                  {LAND_STATUSES.map(s => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Вид разрешённого использования (ВРИ) *</label>
                <select className={`w-full px-3 py-2 border rounded-lg ${err('land_vri')}`}
                  value={editing.land_vri || ''}
                  onChange={e => { setEditing({ ...editing, land_vri: e.target.value || null }); clearErr('land_vri'); }}>
                  <option value="">— Не указано —</option>
                  {landVri.map(v => <option key={v.id} value={v.slug}>{v.name}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="sm:col-span-3">
            <div className="flex flex-wrap gap-4 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.has_furniture}
                  onChange={e => setEditing({ ...editing, has_furniture: e.target.checked })} />
                <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0"><Icon name="Sofa" size={11} className="text-orange-600" /></div>
                <span className="text-sm">Мебель есть</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.has_equipment}
                  onChange={e => setEditing({ ...editing, has_equipment: e.target.checked })} />
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon name="Settings2" size={11} className="text-slate-600" /></div>
                <span className="text-sm">Оборудование есть</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!editing.is_apartments}
                  onChange={e => setEditing({ ...editing, is_apartments: e.target.checked })} />
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"><Icon name="Home" size={11} className="text-indigo-600" /></div>
                <span className="text-sm">Апартаменты</span>
              </label>
            </div>
            <label className="text-xs text-muted-foreground block mb-2">Коммуникации</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {UTILITIES_MAP.map(({ key, label, icon, color, bg, options }) => {
                const list = (editing.utilities || '').split(',').map(s => s.trim()).filter(Boolean);
                const current = list.find(v => v.startsWith(key + ':'));
                const selected = current ? current.split(':')[1]?.trim() : '';

                const handleChange = (val: string) => {
                  const without = list.filter(v => !v.startsWith(key + ':'));
                  const next = val ? [...without, `${key}: ${val}`] : without;
                  setEditing({ ...editing, utilities: next.join(', ') });
                };

                return (
                  <div key={key} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                    <div className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon name={icon} size={13} className={color} />
                    </div>
                    <span className="text-xs font-medium min-w-[110px]">{label}</span>
                    <select
                      value={selected}
                      onChange={e => handleChange(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 border border-border rounded-md bg-white outline-none"
                    >
                      <option value="">— Не указано —</option>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}