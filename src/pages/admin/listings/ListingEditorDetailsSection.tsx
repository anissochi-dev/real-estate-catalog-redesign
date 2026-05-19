import PhonePickerInput from '@/components/admin/PhonePickerInput';
import { Listing, City, FINISHING, ROAD_LINES, detectVideoType } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  cities: City[];
}

export default function ListingEditorDetailsSection({ editing, setEditing, cities }: Props) {
  return (
    <>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold">Характеристики помещения</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Отделка</label>
            <select className="w-full px-3 py-2 border rounded-lg" value={editing.finishing || ''}
              onChange={e => setEditing({ ...editing, finishing: e.target.value })}>
              <option value="">— Не указано —</option>
              {FINISHING.map(f => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
            </select>
          </div>
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
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Коммуникации</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="вода, канализация, отопление, газ, интернет..."
              value={editing.utilities || ''}
              onChange={e => setEditing({ ...editing, utilities: e.target.value })} />
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
                setEditing({
                  ...editing,
                  monthly_rent: v,
                  yearly_rent: v ? Math.round(v * 12) : editing.yearly_rent ?? null,
                });
              }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">ГАП (год. арендный поток), ₽</label>
            <input type="number" min="0" className="w-full px-3 py-2 border rounded-lg"
              value={editing.yearly_rent ?? ''}
              onChange={e => {
                const v = e.target.value === '' ? null : +e.target.value;
                setEditing({
                  ...editing,
                  yearly_rent: v,
                  monthly_rent: v ? Math.round(v / 12) : editing.monthly_rent ?? null,
                });
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Город</label>
          <select className="w-full px-3 py-2 border rounded-lg" value={editing.city || 'Краснодар'}
            onChange={e => setEditing({ ...editing, city: e.target.value })}>
            {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Район</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            value={editing.district || ''} onChange={e => setEditing({ ...editing, district: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Адрес</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Имя собственника</label>
          <input className="w-full px-3 py-2 border rounded-lg"
            value={editing.owner_name || ''} onChange={e => setEditing({ ...editing, owner_name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Телефон собственника</label>
          <PhonePickerInput
            value={editing.owner_phone || ''}
            onChange={(phone, name) => setEditing({ ...editing, owner_phone: phone, ...(name && !editing.owner_name ? { owner_name: name } : {}) })}
            onNameChange={name => { if (!editing.owner_name) setEditing({ ...editing, owner_name: name }); }}
          />
        </div>
      </div>

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