import CharCount from '@/components/ui/CharCount';
import { Lead, PROPERTY_TYPES_LEAD, PROPERTY_CATEGORIES_LEAD } from './leadsTypes';
import { District } from '../districts/DistrictsTypes';
import LeadDistrictDropdown from './LeadDistrictDropdown';

interface Props {
  editing: Partial<Lead>;
  setEditing: (l: Partial<Lead> | null) => void;
  districts: District[];
  errors: Record<string, boolean>;
}

export default function LeadEditRequestSection({ editing, setEditing, districts, errors }: Props) {
  return (
    <>
    {/* Тип сделки и категория объекта */}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Тип сделки <span className="text-red-500">*</span>
          {errors.property_type && <span className="ml-1 text-red-500 font-normal">— обязательно</span>}
        </label>
        <select className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.property_type ? 'border-red-400 bg-red-50' : ''}`}
          value={editing.property_type || ''}
          onChange={e => setEditing({ ...editing, property_type: e.target.value || null })}>
          <option value="">— Выберите —</option>
          {PROPERTY_TYPES_LEAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Категория объекта <span className="text-red-500">*</span>
          {errors.property_category && <span className="ml-1 text-red-500 font-normal">— обязательно</span>}
        </label>
        <select className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.property_category ? 'border-red-400 bg-red-50' : ''}`}
          value={editing.property_category || ''}
          onChange={e => setEditing({ ...editing, property_category: e.target.value || null })}>
          <option value="">— Выберите —</option>
          {PROPERTY_CATEGORIES_LEAD.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
    </div>

    {/* Бюджет от/до */}
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">
        Бюджет, ₽ — до <span className="text-red-500">*</span>
        {errors.budget_to && <span className="ml-1 text-red-500 font-normal">— обязательно</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <input type="number" className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none w-full px-3 py-2 border rounded-lg text-sm" placeholder="от (необязательно)"
          value={editing.budget ?? ''}
          onChange={e => setEditing({ ...editing, budget: e.target.value === '' ? null : +e.target.value })} />
        <input type="number" className={`[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none w-full px-3 py-2 border rounded-lg text-sm ${errors.budget_to ? 'border-red-400 bg-red-50' : ''}`} placeholder="до"
          value={editing.budget_to ?? ''}
          onChange={e => setEditing({ ...editing, budget_to: e.target.value === '' ? null : +e.target.value })} />
      </div>
    </div>

    {/* Площадь от/до */}
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">
        Площадь, м² — до <span className="text-red-500">*</span>
        {errors.area_to && <span className="ml-1 text-red-500 font-normal">— обязательно</span>}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <input type="number" className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none w-full px-3 py-2 border rounded-lg text-sm" placeholder="от (необязательно)"
          value={editing.area_from ?? ''}
          onChange={e => setEditing({ ...editing, area_from: e.target.value === '' ? null : +e.target.value })} />
        <input type="number" className={`[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none w-full px-3 py-2 border rounded-lg text-sm ${errors.area_to ? 'border-red-400 bg-red-50' : ''}`} placeholder="до"
          value={editing.area_to ?? ''}
          onChange={e => setEditing({ ...editing, area_to: e.target.value === '' ? null : +e.target.value })} />
      </div>
    </div>

    {/* Коммуникации */}
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">Коммуникации (эл. энергия, газ, вода и т.д.)</label>
      <input className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Эл. энергия 15 кВт, газ, вода"
        value={editing.utilities || ''}
        onChange={e => setEditing({ ...editing, utilities: e.target.value || null })} />
    </div>

    {/* Районы */}
    {districts.length > 0 && (
      <LeadDistrictDropdown
        districts={districts}
        selected={editing.district_ids || []}
        onChange={ids => setEditing({ ...editing, district_ids: ids })}
        error={errors.district_ids}
      />
    )}

    <div>
      <label className="text-xs text-muted-foreground mb-1 block">
        Текст запроса <span className="text-red-500">*</span>
        {errors.message && <span className="ml-1 text-red-500 font-normal">— обязательно</span>}
      </label>
      <CharCount as="textarea" rows={5} max={1500} warnAt={1300} placeholder="Опишите запрос клиента"
        className={errors.message ? 'border-red-400 bg-red-50' : ''}
        value={editing.message || ''}
        onChange={e => setEditing({ ...editing, message: (e.target as HTMLTextAreaElement).value })} />
    </div>
    </>
  );
}
