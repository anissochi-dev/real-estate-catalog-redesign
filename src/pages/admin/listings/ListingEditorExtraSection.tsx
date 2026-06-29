import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CharCount from '@/components/ui/CharCount';
import { Listing, BUILDING_CLASSES, PROPERTY_RIGHTS, FINISHING } from './types';
import SeoHeadingsBlock, { SeoHeadings } from '@/components/admin/SeoHeadingsBlock';

const DEAL_LABEL: Record<string, string> = {
  sale: 'Продажа', rent: 'Аренда', business: 'Готовый бизнес',
};
const TYPE_LABEL: Record<string, string> = {
  office: 'офиса', retail: 'торгового помещения', warehouse: 'склада',
  restaurant: 'помещения под общепит', hotel: 'гостиницы', business: 'готового бизнеса',
  gab: 'готового арендного бизнеса', production: 'производственного помещения',
  land: 'земельного участка', building: 'здания', free_purpose: 'помещения',
  car_service: 'помещения под автосервис',
};

function generateHeadings(e: Partial<Listing>): SeoHeadings {
  const city = e.city || 'Краснодар';
  const deal = DEAL_LABEL[e.deal || ''] || 'Аренда';
  const type = TYPE_LABEL[e.category || ''] || 'объекта';
  const area = e.area ? `${e.area} м²` : '';
  const addr = e.district || e.address || city;
  const price = e.price ? `${(e.price / 1_000_000).toFixed(e.price >= 10_000_000 ? 0 : 1)} млн ₽` : '';

  return {
    h1: e.title || `${deal} ${type} в ${city}`,
    h2: [deal, type, area, `в ${city}`].filter(Boolean).join(' '),
    h3: addr ? `${deal} ${type} — ${addr}` : `${deal} ${type} в ${city}`,
    h4: [area, price].filter(Boolean).join(' · ') || `Параметры ${type}`,
    h5: price ? `Стоимость: ${price}` : `Цена по запросу — ${city}`,
  };
}

const IMPROVE_FIELDS = [
  { key: 'seo_title', label: 'SEO-заголовок' },
  { key: 'seo_description', label: 'SEO-описание' },
  { key: 'description', label: 'Описание' },
  { key: 'faq', label: 'FAQ' },
];

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  aiSeoLoading: boolean;
  aiImproveLoading?: boolean;
  onGenerateSeo: () => void;
  onImproveWithAi?: (fields: string[]) => void;
  canEditSeo?: boolean;
}

export default function ListingEditorExtraSection({
  editing, setEditing, errors = {}, setErrors,
  aiSeoLoading, aiImproveLoading, onGenerateSeo, onImproveWithAi, canEditSeo = true,
}: Props) {
  const [improveOpen, setImproveOpen] = useState(false);
  const [improveFields, setImproveFields] = useState<string[]>(['seo_title', 'seo_description', 'description', 'faq']);
  const err = (field: string) => errors[field] ? 'border-red-400 bg-red-50' : '';
  const errWrap = (field: string) => errors[field] ? { 'data-field-error': 'true' as const } : {};
  const clearErr = (field: string) => setErrors?.(v => ({ ...v, [field]: false }));

  return (
    <div className="space-y-1">
      {/* ─── Параметры для досок ─── */}
      <div className="space-y-3 pt-1">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="Share2" size={15} className="text-brand-blue" />
          Параметры для досок объявлений
          <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">Яндекс / Авито / ЦИАН</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div {...errWrap('finishing')}>
            <label className="text-xs text-muted-foreground">Отделка (для досок) *</label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('finishing')}`}
              value={editing.finishing || ''}
              onChange={e => { setEditing({ ...editing, finishing: e.target.value || null }); clearErr('finishing'); }}>
              <option value="">— Не выбрано —</option>
              {FINISHING.map(f => <option key={f[0]} value={f[0]}>{f[1]}</option>)}
            </select>
          </div>
          <div {...errWrap('building_class')}>
            <label className="text-xs text-muted-foreground">Класс здания *</label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('building_class')}`}
              value={editing.building_class || ''}
              onChange={e => { setEditing({ ...editing, building_class: e.target.value || null }); clearErr('building_class'); }}>
              <option value="">— Не выбрано —</option>
              {BUILDING_CLASSES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
            </select>
          </div>
          <div {...errWrap('building_year')}>
            <label className="text-xs text-muted-foreground">Год постройки здания *</label>
            <input type="number" min={1900} max={2030} className={`w-full px-3 py-2 border rounded-lg ${err('building_year')}`}
              placeholder="напр. 2005"
              value={editing.building_year ?? ''}
              onChange={e => { setEditing({ ...editing, building_year: e.target.value === '' ? null : +e.target.value }); clearErr('building_year'); }} />
          </div>
          <div {...errWrap('property_rights')}>
            <label className="text-xs text-muted-foreground">Права на объект *</label>
            <select className={`w-full px-3 py-2 border rounded-lg ${err('property_rights')}`}
              value={editing.property_rights || ''}
              onChange={e => { setEditing({ ...editing, property_rights: e.target.value || null }); clearErr('property_rights'); }}>
              <option value="">— Не выбрано —</option>
              {PROPERTY_RIGHTS.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Мин. площадь нарезки, м²</label>
            <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg"
              placeholder="если делится на части"
              value={editing.min_area ?? ''}
              onChange={e => setEditing({ ...editing, min_area: e.target.value === '' ? null : +e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_furniture}
              onChange={e => setEditing({ ...editing, has_furniture: e.target.checked })} />
            <span className="text-sm">Мебель есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.has_equipment}
              onChange={e => setEditing({ ...editing, has_equipment: e.target.checked })} />
            <span className="text-sm">Оборудование есть</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!editing.is_apartments}
              onChange={e => setEditing({ ...editing, is_apartments: e.target.checked })} />
            <span className="text-sm">Апартаменты</span>
          </label>
        </div>
      </div>

      {/* ─── Доходность и арендатор ─── */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="TrendingUp" size={15} className="text-brand-blue" />
          Доходность и арендатор
        </div>
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
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Название арендатора (если есть)</label>
            <input className="w-full px-3 py-2 border rounded-lg"
              placeholder="напр. «Магнит», «Сбербанк»..."
              value={editing.tenant_name || ''}
              onChange={e => setEditing({ ...editing, tenant_name: e.target.value })} />
          </div>
        </div>
      </div>

      {/* ─── XML фиды ─── */}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Icon name="FileCode" size={15} className="text-brand-blue" />
          Выгрузка в XML фиды
        </div>
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

      {/* ─── SEO ─── */}
      {canEditSeo ? (
        <>
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Icon name="Search" size={14} /> SEO для поисковых систем
              </div>
              <div className="flex items-center gap-3">
                {onImproveWithAi && (
                  <button type="button" onClick={() => setImproveOpen(v => !v)}
                    className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1 font-medium">
                    <Icon name="Wand2" size={12} />
                    Улучшить с ИИ
                  </button>
                )}
                <button type="button" onClick={onGenerateSeo} disabled={aiSeoLoading}
                  className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
                  <Icon name="Sparkles" size={12} />
                  {aiSeoLoading ? 'Генерация...' : 'SEO Title/Desc'}
                </button>
              </div>
            </div>

            {/* Панель «Улучшить с ИИ» */}
            {improveOpen && onImproveWithAi && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                  <Icon name="Wand2" size={12} /> Выберите что перегенерировать
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {IMPROVE_FIELDS.map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox"
                        checked={improveFields.includes(f.key)}
                        onChange={() => setImproveFields(prev =>
                          prev.includes(f.key) ? prev.filter(x => x !== f.key) : [...prev, f.key]
                        )}
                        className="w-3.5 h-3.5 accent-blue-600" />
                      {f.label}
                    </label>
                  ))}
                </div>
                <button type="button"
                  disabled={aiImproveLoading || improveFields.length === 0}
                  onClick={() => { onImproveWithAi(improveFields); setImproveOpen(false); }}
                  className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {aiImproveLoading
                    ? <><Icon name="Loader2" size={12} className="animate-spin" /> Генерация...</>
                    : <><Icon name="Sparkles" size={12} /> Запустить ИИ</>}
                </button>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">SEO Title (до 70 символов)</label>
              <CharCount as="input" max={70} warnAt={60}
                placeholder="Аренда офиса 120 м² в центре Краснодара | BIZNEST"
                value={(editing.seo_title || '').slice(0, 70)}
                onChange={e => setEditing({ ...editing, seo_title: (e.target as HTMLInputElement).value.slice(0, 70) })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SEO Description (до 160 символов)</label>
              <CharCount as="textarea" rows={2} max={160} warnAt={140}
                placeholder="Светлый офис 120 м² с евроремонтом в БЦ на ул. Красной. Парковка, охрана 24/7..."
                value={(editing.seo_description || '').slice(0, 160)}
                onChange={e => setEditing({ ...editing, seo_description: (e.target as HTMLTextAreaElement).value.slice(0, 160) })} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Если поля пустые — поисковики возьмут текст из названия и описания объекта.
            </div>
          </div>

          {/* ─── H1-H5 ─── */}
          <div className="pt-2">
            <SeoHeadingsBlock
              generated={generateHeadings(editing)}
              value={{
                h1: editing.seo_h1 || undefined,
                h2: editing.seo_h2 || undefined,
                h3: editing.seo_h3 || undefined,
                h4: editing.seo_h4 || undefined,
                h5: editing.seo_h5 || undefined,
              }}
              onChange={(v: Partial<SeoHeadings>) => setEditing({
                ...editing,
                seo_h1: v.h1 || null,
                seo_h2: v.h2 || null,
                seo_h3: v.h3 || null,
                seo_h4: v.h4 || null,
                seo_h5: v.h5 || null,
              })}
            />
          </div>
        </>
      ) : (
        <div className="border-t border-border pt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="Lock" size={14} />
          SEO-поля заполняются автоматически при создании объекта.
        </div>
      )}
    </div>
  );
}