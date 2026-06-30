import { Listing, LandVri, LAND_STATUSES } from './types';

const UTILITIES_MAP: { key: string; label: string; options: string[] }[] = [
  { key: 'Вода', label: '💧 Вода', options: ['Центральная', 'Скважина', 'Колодец', 'Привозная'] },
  { key: 'Канализация', label: '🚿 Канализация', options: ['Центральная', 'Септик', 'Выгребная яма', 'Ливневая'] },
  { key: 'Отопление', label: '🔥 Отопление', options: ['Центральное', 'Газовое', 'Электрическое', 'Автономное', 'Печное', 'Тепловой насос'] },
  { key: 'Газ', label: '🔵 Газ', options: ['Магистральный', 'Баллонный', 'Отсутствует'] },
  { key: 'Электричество', label: '⚡ Электричество', options: ['220В', '380В (3 фазы)', 'Генератор', 'Солнечные панели'] },
  { key: 'Интернет', label: '🌐 Интернет', options: ['Оптоволокно', 'Wi-Fi', 'Кабельный', '4G/5G'] },
  { key: 'Вентиляция', label: '💨 Вентиляция', options: ['Приточно-вытяжная', 'Принудительная', 'Естественная'] },
  { key: 'Кондиционирование', label: '❄️ Кондиционирование', options: ['Сплит-система', 'Центральное', 'Чиллер', 'Отсутствует'] },
  { key: 'Пожарная сигнализация', label: '🚒 Пожарная сигнализация', options: ['Есть', 'Отсутствует'] },
  { key: 'Видеонаблюдение', label: '📷 Видеонаблюдение', options: ['Есть', 'Отсутствует'] },
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
            <label className="text-xs text-muted-foreground block mb-2">Коммуникации</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {UTILITIES_MAP.map(({ key, label, options }) => {
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
                    <span className="text-xs font-medium min-w-[120px]">{label}</span>
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