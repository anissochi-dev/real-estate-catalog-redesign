import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';

interface Criteria {
  id: number;
  title: string;
  is_active: boolean;
  platforms: string[];
  keywords_include: string[];
  keywords_exclude: string[];
  deal_types: string[];
  categories: string[];
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  districts: string[];
  require_price: boolean;
  require_area: boolean;
  require_phone: boolean;
  require_photo: boolean;
  require_address: boolean;
  route_to: string;
  run_interval_hours: number;
  last_run_at: string | null;
  next_run_at: string | null;
  pending_count: number;
}

const PLATFORMS = [
  { id: 'vk',       label: 'ВКонтакте', color: 'text-blue-600' },
  { id: 'ok',       label: 'Одноклассники', color: 'text-orange-500' },
  { id: 'telegram', label: 'Telegram', color: 'text-sky-500' },
];

const CATEGORIES_LIST = [
  { id: 'office', label: 'Офис' }, { id: 'retail', label: 'Торговое' },
  { id: 'warehouse', label: 'Склад' }, { id: 'production', label: 'Производство' },
  { id: 'catering', label: 'Общепит' }, { id: 'free_purpose', label: 'ПСН' },
  { id: 'building', label: 'Здание' }, { id: 'land', label: 'Земля' },
  { id: 'car_service', label: 'Автосервис' }, { id: 'gab', label: 'ГАБ' },
];

const DISTRICTS_LIST = ['ФМР', 'ЦМР', 'ЮМР', 'Гидрострой', 'Музыкальный', 'Прикубанский', 'Карасунский', 'Западный'];

const ROUTE_OPTIONS = [
  { id: 'moderation', label: 'В очередь модерации', desc: 'Брокер проверяет каждый пост вручную' },
  { id: 'leads',      label: 'Сразу в заявки',      desc: 'Без проверки, автоматически' },
  { id: 'listings',   label: 'Сразу в объекты',     desc: 'Черновик объекта без проверки' },
  { id: 'market',     label: 'Только статистика',   desc: 'В рыночную аналитику, без действий' },
];

const INTERVALS = [1, 3, 6, 12, 24];

const EMPTY_FORM = {
  title: '',
  platforms: ['telegram'] as string[],
  keywords_include: [] as string[],
  keywords_exclude: [] as string[],
  deal_types: [] as string[],
  categories: [] as string[],
  price_min: '',
  price_max: '',
  area_min: '',
  area_max: '',
  districts: [] as string[],
  require_price: false,
  require_area: false,
  require_phone: false,
  require_photo: false,
  require_address: false,
  route_to: 'moderation',
  run_interval_hours: 6,
  is_active: true,
};

export default function SocialCriteriaPanel({
  token, apiUrl, onRun,
}: { token: string; apiUrl: string; onRun: () => void }) {
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [kwInput, setKwInput] = useState('');
  const [kwExInput, setKwExInput] = useState('');

  const post = async (body: object) => {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
    return r;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await post({ action: 'criteria_list' });
      if (!r.error) setCriteria(r.criteria || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setKwInput(''); setKwExInput('');
    setShowForm(true);
  };

  const openEdit = (c: Criteria) => {
    setForm({
      title: c.title,
      platforms: c.platforms || [],
      keywords_include: c.keywords_include || [],
      keywords_exclude: c.keywords_exclude || [],
      deal_types: c.deal_types || [],
      categories: c.categories || [],
      price_min: c.price_min ? String(c.price_min) : '',
      price_max: c.price_max ? String(c.price_max) : '',
      area_min: c.area_min ? String(c.area_min) : '',
      area_max: c.area_max ? String(c.area_max) : '',
      districts: c.districts || [],
      require_price: c.require_price,
      require_area: c.require_area,
      require_phone: c.require_phone,
      require_photo: c.require_photo,
      require_address: c.require_address,
      route_to: c.route_to || 'moderation',
      run_interval_hours: c.run_interval_hours || 6,
      is_active: c.is_active,
    });
    setEditId(c.id);
    setKwInput(''); setKwExInput('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Введите название'); return; }
    if (!form.platforms.length) { toast.error('Выберите хотя бы одну платформу'); return; }
    setSaving(true);
    try {
      const body = {
        action: editId ? 'criteria_edit' : 'criteria_add',
        id: editId,
        ...form,
        price_min: form.price_min ? Number(form.price_min) : null,
        price_max: form.price_max ? Number(form.price_max) : null,
        area_min:  form.area_min  ? Number(form.area_min)  : null,
        area_max:  form.area_max  ? Number(form.area_max)  : null,
      };
      const r = await post(body);
      if (r.error) { toast.error(r.error); return; }
      toast.success(editId ? 'Критерий обновлён' : 'Критерий создан');
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const handleToggle = async (id: number) => {
    await post({ action: 'criteria_toggle', id });
    load();
  };

  const handleRun = async (id: number) => {
    setRunningId(id);
    try {
      const r = await post({ action: 'criteria_run', id });
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Запущено — найдено ${r.total_saved ?? 0} объявлений`);
      load(); onRun();
    } finally { setRunningId(null); }
  };

  const toggle = (arr: string[], val: string): string[] =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const addKw = (type: 'include' | 'exclude') => {
    const val = type === 'include' ? kwInput.trim() : kwExInput.trim();
    if (!val) return;
    if (type === 'include') {
      setForm(f => ({ ...f, keywords_include: [...f.keywords_include, val] }));
      setKwInput('');
    } else {
      setForm(f => ({ ...f, keywords_exclude: [...f.keywords_exclude, val] }));
      setKwExInput('');
    }
  };

  const fmtDate = (s: string | null) => {
    if (!s) return 'никогда';
    return new Date(s).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const routeLabel: Record<string, string> = {
    moderation: 'Модерация', leads: 'Заявки', listings: 'Объекты', market: 'Статистика',
  };
  const routeColor: Record<string, string> = {
    moderation: 'bg-amber-50 text-amber-700', leads: 'bg-blue-50 text-blue-700',
    listings: 'bg-green-50 text-green-700', market: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="space-y-3">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Критерии определяют что искать и куда отправлять найденные объявления
        </p>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-semibold"
        >
          <Icon name="Plus" size={13} />
          Новый критерий
        </button>
      </div>

      {/* Список критериев */}
      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Icon name="Loader2" size={20} className="animate-spin mx-auto mb-2" />
          Загрузка…
        </div>
      ) : criteria.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Icon name="SlidersHorizontal" size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground mb-3">Критериев пока нет</p>
          <p className="text-xs text-muted-foreground mb-4">
            Создайте критерий поиска, чтобы парсер знал что искать в соцсетях
          </p>
          <button onClick={openNew} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold">
            Создать первый критерий
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {criteria.map(c => (
            <div key={c.id} className={`bg-white rounded-2xl border p-4 ${c.is_active ? 'border-border' : 'border-border opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${routeColor[c.route_to] || 'bg-slate-50 text-slate-600'}`}>
                      → {routeLabel[c.route_to] || c.route_to}
                    </span>
                    {c.pending_count > 0 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-semibold">
                        {c.pending_count} ожидают
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {c.platforms.map(p => (
                        <span key={p} className={p === 'vk' ? 'text-blue-500' : p === 'ok' ? 'text-orange-500' : 'text-sky-500'}>
                          {p === 'vk' ? 'VK' : p === 'ok' ? 'OK' : 'TG'}
                        </span>
                      )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, <span key={i}>·</span>, el], [] as React.ReactNode[])}
                    </span>
                    {c.keywords_include.length > 0 && (
                      <span>
                        слова: {c.keywords_include.slice(0, 3).join(', ')}
                        {c.keywords_include.length > 3 && ` +${c.keywords_include.length - 3}`}
                      </span>
                    )}
                    {c.categories.length > 0 && (
                      <span>кат: {c.categories.length}</span>
                    )}
                    <span>каждые {c.run_interval_hours}ч</span>
                    <span>посл.: {fmtDate(c.last_run_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRun(c.id)}
                    disabled={runningId === c.id}
                    title="Запустить сейчас"
                    className="p-1.5 hover:bg-violet-50 rounded-lg text-violet-600 disabled:opacity-50"
                  >
                    {runningId === c.id
                      ? <Icon name="Loader2" size={14} className="animate-spin" />
                      : <Icon name="Play" size={14} />}
                  </button>
                  <button onClick={() => openEdit(c)} title="Редактировать" className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
                    <Icon name="Pencil" size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(c.id)}
                    title={c.is_active ? 'Отключить' : 'Включить'}
                    className={`p-1.5 rounded-lg ${c.is_active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-muted'}`}
                  >
                    <Icon name={c.is_active ? 'ToggleRight' : 'ToggleLeft'} size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Форма создания/редактирования */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl my-4 shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="font-semibold">{editId ? 'Редактировать критерий' : 'Новый критерий поиска'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg">
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
                    onKeyDown={e => e.key === 'Enter' && addKw('include')}
                    placeholder="сдам офис, аренда склад…"
                    className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <button onClick={() => addKw('include')} className="px-3 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold">
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
                    onKeyDown={e => e.key === 'Enter' && addKw('exclude')}
                    placeholder="квартира, жилая, комната…"
                    className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <button onClick={() => addKw('exclude')} className="px-3 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold">
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
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-xl text-sm">
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
                {editId ? 'Сохранить' : 'Создать критерий'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
