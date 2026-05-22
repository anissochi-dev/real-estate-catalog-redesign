import { Listing, ROAD_LINES } from './types';

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
}

export default function ListingRoomFeatures({ editing, setEditing }: Props) {
  return (
    <>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Характеристики помещения</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Высота потолка, м</label>
            <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 3.2"
              value={editing.ceiling_height ?? ''}
              onChange={e => setEditing({ ...editing, ceiling_height: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Эл. мощность, кВт</label>
            <input type="number" step="0.1" min="0" className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. 15"
              value={editing.electricity_kw ?? ''}
              onChange={e => setEditing({ ...editing, electricity_kw: e.target.value === '' ? null : +e.target.value })} />
          </div>
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
          <div>
            <label className="text-xs text-muted-foreground">Линия расположения</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={editing.road_line || ''}
              onChange={e => setEditing({ ...editing, road_line: e.target.value })}>
              <option value="">— Не указано —</option>
              {ROAD_LINES.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Доходность и арендатор</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">МАП (мес. арендный поток), ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.monthly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, monthly_rent: v, yearly_rent: v ? Math.round(v * 12) : editing.yearly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">ГАП (год. арендный поток), ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.yearly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({ ...editing, yearly_rent: v, monthly_rent: v ? Math.round(v / 12) : editing.monthly_rent ?? null });
              }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Окупаемость, мес</label>
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
          <div>
            <label className="text-xs text-muted-foreground">Прибыль/мес, ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.profit ?? ''}
              onChange={e => setEditing({ ...editing, profit: e.target.value === '' ? null : +e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Название арендатора (если есть)</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Магнит», «Сбербанк»..."
              value={editing.tenant_name || ''}
              onChange={e => setEditing({ ...editing, tenant_name: e.target.value })} />
          </div>
        </div>
      </div>
    </>
  );
}