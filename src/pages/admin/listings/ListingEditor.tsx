import { useEffect, useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import Icon from '@/components/ui/icon';
import {
  Listing, City, Purpose,
  CATS, DEALS, CONDITIONS, PARKING, ENTRANCE, FINISHING, ROAD_LINES,
  fmtDate, perM2, detectVideoType,
} from './types';

const PREDICT_URL = 'https://functions.poehali.dev/9986e5a6-c4d4-407a-919f-a303aa3eddf2';

interface PredictHint {
  market_price: number | null;
  price_per_m2_median: number | null;
  price_assessment: { label: string; color: string; delta_pct: number };
  payback_months: number | null;
  comparables_count: number;
  data_source: string;
}

const ASSESS_COLOR: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  green:   'text-green-600 bg-green-50 border-green-200',
  blue:    'text-blue-600 bg-blue-50 border-blue-200',
  amber:   'text-amber-600 bg-amber-50 border-amber-200',
  red:     'text-red-600 bg-red-50 border-red-200',
  gray:    'text-slate-500 bg-slate-50 border-slate-200',
};

function fmt(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' млн ₽';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' тыс. ₽';
  return n.toLocaleString('ru') + ' ₽';
}

function usePriceHint(category: string, deal: string, area: number, price: number, district: string) {
  const [hint, setHint] = useState<PredictHint | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!area || !category || !deal) { setHint(null); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLoading(true);
      fetch(PREDICT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, deal, area, price, district }),
      })
        .then(r => r.json())
        .then(d => { if (!d.error) setHint(d as PredictHint); })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [category, deal, area, price, district]);

  return { hint, loading };
}

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  photos: string[];
  setPhotos: (p: string[]) => void;
  cities: City[];
  purposes: Purpose[];
  aiLoading: boolean;
  aiTagsLoading: boolean;
  aiSeoLoading: boolean;
  aiAllLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  onGenerateSeo: () => void;
  onGenerateAll: () => void;
  onClose: () => void;
  onSave: () => void;
}

export default function ListingEditor({
  editing, setEditing, photos, setPhotos, cities, purposes,
  aiLoading, aiTagsLoading, aiSeoLoading, aiAllLoading,
  onDescribe, onGenerateTags, onGenerateSeo, onGenerateAll, onClose, onSave,
}: Props) {
  const { hint, loading: hintLoading } = usePriceHint(
    editing.category || '',
    editing.deal || '',
    Number(editing.area || 0),
    Number(editing.price || 0),
    editing.district || '',
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex justify-between items-center sticky top-0 bg-white z-10 gap-3">
          <div className="font-display font-700 text-lg flex items-center gap-2">
            {editing.id ? 'Редактировать' : 'Новый объект'}
            {editing.public_code ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
                ID: {editing.public_code}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onGenerateAll} disabled={aiAllLoading}
              title="Сгенерировать описание, теги и SEO одним кликом"
              className="btn-orange text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
              <Icon name={aiAllLoading ? 'Loader2' : 'Sparkles'} size={13} className={aiAllLoading ? 'animate-spin' : ''} />
              {aiAllLoading ? 'Генерация...' : 'Сгенерировать всё'}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <Icon name="X" size={20} />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Название"
            value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} />

          <div>
            <label className="text-sm font-semibold block mb-1">Фотографии</label>
            <ImageUploader value={photos} onChange={setPhotos} folder="photos" multiple />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Категория</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value })}>
                {CATS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Тип сделки</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.deal}
                onChange={e => setEditing({ ...editing, deal: e.target.value })}>
                {DEALS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Назначение</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.purpose || ''}
                onChange={e => setEditing({ ...editing, purpose: e.target.value })}>
                <option value="">— Не выбрано —</option>
                {purposes.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Состояние</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.condition || ''}
                onChange={e => setEditing({ ...editing, condition: e.target.value })}>
                <option value="">— Не выбрано —</option>
                {CONDITIONS.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Цена, ₽</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg"
                value={editing.price || ''} onChange={e => setEditing({ ...editing, price: +e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Площадь, м²</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg"
                value={editing.area || ''} onChange={e => setEditing({ ...editing, area: +e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Единица цены</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.price_unit || 'total'}
                onChange={e => setEditing({ ...editing, price_unit: e.target.value })}>
                <option value="total">За весь объект</option>
                <option value="m2">За м²</option>
                <option value="sotka">За сотку</option>
              </select>
            </div>
          </div>

          {editing.price && editing.area ? (
            <div className="text-sm bg-muted/40 rounded-lg p-3">
              За м²: <b>{perM2(+editing.price, +editing.area).toLocaleString('ru')} ₽</b>
              {editing.price_unit === 'total' && ' (рассчитано из цены за объект)'}
            </div>
          ) : null}

          {/* Подсказка по рынку */}
          {editing.area && editing.category && editing.deal && (
            <div className="rounded-xl border bg-slate-50 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-600 mb-2">
                <Icon name="TrendingUp" size={12} />
                Анализ рынка
                {hintLoading && <Icon name="Loader2" size={11} className="animate-spin text-slate-400 ml-1" />}
              </div>
              {hint ? (
                <div className="flex flex-wrap gap-2">
                  {/* Оценка цены */}
                  {editing.price && hint.price_assessment && (
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${ASSESS_COLOR[hint.price_assessment.color] || ASSESS_COLOR.gray}`}>
                      {hint.price_assessment.label}
                      {hint.price_assessment.delta_pct !== 0 && (
                        <> {hint.price_assessment.delta_pct > 0 ? '+' : ''}{hint.price_assessment.delta_pct}%</>
                      )}
                    </span>
                  )}
                  {/* Рыночная цена */}
                  {hint.market_price && (
                    <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                      Рынок: <b>{fmt(hint.market_price)}</b>
                    </span>
                  )}
                  {/* Цена за м² */}
                  {hint.price_per_m2_median && (
                    <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                      Медиана ₽/м²: <b>{hint.price_per_m2_median.toLocaleString('ru')} ₽</b>
                    </span>
                  )}
                  {/* Окупаемость */}
                  {hint.payback_months && (editing.deal === 'sale' || editing.deal === 'business') && (
                    <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[11px]">
                      Окупаемость: <b>
                        {hint.payback_months < 12
                          ? `${hint.payback_months} мес.`
                          : `${Math.floor(hint.payback_months / 12)} лет`}
                      </b>
                    </span>
                  )}
                  {/* Источник данных */}
                  <span className="text-slate-400 text-[10px] self-center">
                    {hint.comparables_count > 0
                      ? `по ${hint.comparables_count} аналогам`
                      : 'нормативы рынка'}
                  </span>
                </div>
              ) : !hintLoading ? (
                <span className="text-slate-400">Укажите цену и площадь для анализа</span>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Этаж</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg"
                value={editing.floor ?? ''} onChange={e => setEditing({ ...editing, floor: e.target.value === '' ? null : +e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Этажность</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg"
                value={editing.total_floors ?? ''} onChange={e => setEditing({ ...editing, total_floors: e.target.value === '' ? null : +e.target.value })} />
            </div>
            <div></div>
            <div>
              <label className="text-xs text-muted-foreground">Парковка</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.parking || 'none'}
                onChange={e => setEditing({ ...editing, parking: e.target.value })}>
                {PARKING.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Вход</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={editing.entrance || 'street'}
                onChange={e => setEditing({ ...editing, entrance: e.target.value })}>
                {ENTRANCE.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
              </select>
            </div>
          </div>

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
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="+7..."
                value={editing.owner_phone || ''} onChange={e => setEditing({ ...editing, owner_phone: e.target.value })} />
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

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">Описание</label>
              <button onClick={onDescribe} disabled={aiLoading}
                className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                <Icon name="Sparkles" size={12} />
                {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
              </button>
            </div>
            <textarea className="w-full px-3 py-2 border rounded-lg" rows={4}
              value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold">Теги для поиска</label>
              <button onClick={onGenerateTags} disabled={aiTagsLoading}
                className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                <Icon name="Sparkles" size={12} />
                {aiTagsLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
              </button>
            </div>
            <input className="w-full px-3 py-2 border rounded-lg bg-muted/30" readOnly
              placeholder="Теги создаются автоматически на основе данных объекта"
              value={typeof editing.tags === 'string' ? editing.tags : (editing.tags || []).join(', ')} />
            <div className="text-xs text-muted-foreground mt-1">Создаются на основе данных. Кнопка ИИ — пересоздать.</div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-sm font-semibold">Дополнительно</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.use_watermark}
                  onChange={e => setEditing({ ...editing, use_watermark: e.target.checked })} />
                Использовать водяной знак
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_hot}
                  onChange={e => setEditing({ ...editing, is_hot: e.target.checked })} />
                Горячее
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_new}
                  onChange={e => setEditing({ ...editing, is_new: e.target.checked })} />
                Новинка
              </label>
            </div>
            <div className="text-xs text-muted-foreground pt-2">Выгрузка в XML фиды:</div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.export_yandex}
                  onChange={e => setEditing({ ...editing, export_yandex: e.target.checked })} />
                Яндекс.Недвижимость
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.export_avito}
                  onChange={e => setEditing({ ...editing, export_avito: e.target.checked })} />
                Авито
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.export_cian}
                  onChange={e => setEditing({ ...editing, export_cian: e.target.checked })} />
                ЦИАН
              </label>
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Icon name="Search" size={14} /> SEO для поисковых систем
              </div>
              <button type="button" onClick={onGenerateSeo} disabled={aiSeoLoading}
                className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                <Icon name="Sparkles" size={12} />
                {aiSeoLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SEO Title (до 70 символов)</label>
              <input className="w-full px-3 py-2 border rounded-lg"
                maxLength={120}
                placeholder="Аренда офиса 120 м² в центре Краснодара | BIZNEST"
                value={editing.seo_title || ''}
                onChange={e => setEditing({ ...editing, seo_title: e.target.value })} />
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {(editing.seo_title || '').length}/70 символов
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SEO Description (до 160 символов)</label>
              <textarea rows={2} className="w-full px-3 py-2 border rounded-lg"
                maxLength={250}
                placeholder="Светлый офис 120 м² с евроремонтом в БЦ на ул. Красной. Парковка, охрана 24/7..."
                value={editing.seo_description || ''}
                onChange={e => setEditing({ ...editing, seo_description: e.target.value })} />
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {(editing.seo_description || '').length}/160 символов
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Если поля пустые — поисковики возьмут текст из названия и описания объекта.
            </div>
          </div>

          {editing.id && (
            <div className="text-xs text-muted-foreground border-t border-border pt-3">
              Создан: {fmtDate(editing.created_at as string)} ·
              Обновлён: {fmtDate(editing.updated_at as string)}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
          <button onClick={onSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}