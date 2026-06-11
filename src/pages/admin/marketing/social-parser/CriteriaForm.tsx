import Icon from '@/components/ui/icon';
import {
  CriteriaForm as CriteriaFormType,
  PLATFORMS, CATEGORIES_LIST, DISTRICTS_LIST, ROUTE_OPTIONS, INTERVALS,
  toggle,
} from './criteriaTypes';

interface Props {
  form: CriteriaFormType;
  setForm: React.Dispatch<React.SetStateAction<CriteriaFormType>>;
  editId: number | null;
  saving: boolean;
  kwInput: string;
  kwExInput: string;
  setKwInput: (v: string) => void;
  setKwExInput: (v: string) => void;
  onAddKw: (type: 'include' | 'exclude') => void;
  onSave: () => void;
  onClose: () => void;
}

export default function CriteriaForm({
  form,
  setForm,
  editId,
  saving,
  kwInput,
  kwExInput,
  setKwInput,
  setKwExInput,
  onAddKw,
  onSave,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-xl my-4 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold">{editId ? 'Редактировать критерий' : 'Новый критерий поиска'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Название */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Название критерия</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Например: Аренда офисов ФМР"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
          </div>

          {/* Платформы */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Платформы</label>
            <div className="flex gap-2 flex-wrap">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setForm(f => ({ ...f, platforms: toggle(f.platforms, p.id) }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    form.platforms.includes(p.id)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ключевые слова — обязательные */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Ключевые слова <span className="font-normal">(хотя бы одно должно быть в посте)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                value={kwInput}
                onChange={e => setKwInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddKw('include')}
                placeholder="сдам офис, аренда склад…"
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <button onClick={() => onAddKw('include')} className="px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold">
                Добавить
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.keywords_include.map(kw => (
                <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 rounded-lg text-xs">
                  {kw}
                  <button onClick={() => setForm(f => ({ ...f, keywords_include: f.keywords_include.filter(x => x !== kw) }))}>
                    <Icon name="X" size={10} />
                  </button>
                </span>
              ))}
              {form.keywords_include.length === 0 && (
                <span className="text-xs text-muted-foreground">Если не указать — будут найдены все объявления о недвижимости</span>
              )}
            </div>
          </div>

          {/* Ключевые слова — исключающие */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Исключить слова <span className="font-normal">(пост с этими словами пропускается)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                value={kwExInput}
                onChange={e => setKwExInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddKw('exclude')}
                placeholder="квартира, жилая, комната…"
                className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
              <button onClick={() => onAddKw('exclude')} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold">
                Добавить
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.keywords_exclude.map(kw => (
                <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-xs">
                  {kw}
                  <button onClick={() => setForm(f => ({ ...f, keywords_exclude: f.keywords_exclude.filter(x => x !== kw) }))}>
                    <Icon name="X" size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Тип сделки */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Тип сделки</label>
            <div className="flex gap-2">
              {[{ id: 'rent', label: 'Аренда' }, { id: 'sale', label: 'Продажа' }].map(d => (
                <button
                  key={d.id}
                  onClick={() => setForm(f => ({ ...f, deal_types: toggle(f.deal_types, d.id) }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    form.deal_types.includes(d.id)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {d.label}
                </button>
              ))}
              {form.deal_types.length === 0 && (
                <span className="text-xs text-muted-foreground self-center">Оба типа (не ограничено)</span>
              )}
            </div>
          </div>

          {/* Категории */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Категории</label>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES_LIST.map(c => (
                <button
                  key={c.id}
                  onClick={() => setForm(f => ({ ...f, categories: toggle(f.categories, c.id) }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    form.categories.includes(c.id)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Цена и площадь */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Цена от, руб</label>
              <input
                type="number"
                value={form.price_min}
                onChange={e => setForm(f => ({ ...f, price_min: e.target.value }))}
                placeholder="0"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Цена до, руб</label>
              <input
                type="number"
                value={form.price_max}
                onChange={e => setForm(f => ({ ...f, price_max: e.target.value }))}
                placeholder="не ограничено"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Площадь от, м²</label>
              <input
                type="number"
                value={form.area_min}
                onChange={e => setForm(f => ({ ...f, area_min: e.target.value }))}
                placeholder="0"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Площадь до, м²</label>
              <input
                type="number"
                value={form.area_max}
                onChange={e => setForm(f => ({ ...f, area_max: e.target.value }))}
                placeholder="не ограничено"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              />
            </div>
          </div>

          {/* Районы */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Районы</label>
            <div className="flex gap-1.5 flex-wrap">
              {DISTRICTS_LIST.map(d => (
                <button
                  key={d}
                  onClick={() => setForm(f => ({ ...f, districts: toggle(f.districts, d) }))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    form.districts.includes(d)
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Требования к посту */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Обязательные поля в посте
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'require_price',   label: 'Цена' },
                { key: 'require_area',    label: 'Площадь' },
                { key: 'require_phone',   label: 'Телефон' },
                { key: 'require_photo',   label: 'Фото' },
                { key: 'require_address', label: 'Адрес' },
              ].map(req => (
                <label key={req.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[req.key as keyof typeof form] as boolean}
                    onChange={e => setForm(f => ({ ...f, [req.key]: e.target.checked }))}
                    className="rounded"
                  />
                  {req.label}
                </label>
              ))}
            </div>
          </div>

          {/* Куда отправлять */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Куда отправлять найденные объявления</label>
            <div className="space-y-1.5">
              {ROUTE_OPTIONS.map(opt => (
                <label key={opt.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  form.route_to === opt.id ? 'border-violet-400 bg-violet-50' : 'border-border bg-white'
                }`}>
                  <input
                    type="radio"
                    name="route_to"
                    value={opt.id}
                    checked={form.route_to === opt.id}
                    onChange={() => setForm(f => ({ ...f, route_to: opt.id }))}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Расписание */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Запускать каждые</label>
            <div className="flex gap-2 flex-wrap">
              {INTERVALS.map(h => (
                <button
                  key={h}
                  onClick={() => setForm(f => ({ ...f, run_interval_hours: h }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    form.run_interval_hours === h
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-border text-foreground/70'
                  }`}
                >
                  {h === 1 ? '1 час' : h === 24 ? '24 часа' : `${h} ч`}
                </button>
              ))}
            </div>
          </div>

          {/* Активность */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="rounded"
            />
            Критерий активен (будет запускаться по расписанию)
          </label>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-xl text-sm">
            Отмена
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
            {editId ? 'Сохранить' : 'Создать критерий'}
          </button>
        </div>
      </div>
    </div>
  );
}
