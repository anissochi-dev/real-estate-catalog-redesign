import Icon from '@/components/ui/icon';
import CharCount from '@/components/ui/CharCount';
import { Listing } from './types';
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

// Основное описание объекта сюда намеренно НЕ включено — для него есть своя
// отдельная кнопка «Улучшить с ИИ» на вкладке «Описание» (ListingEditorContentSection),
// чтобы не путать с SEO-полями и не перезаписывать его случайно из этой панели.
const IMPROVE_FIELDS = [
  { key: 'seo_title', label: 'SEO-заголовок' },
  { key: 'seo_description', label: 'SEO-описание' },
  { key: 'faq', label: 'FAQ' },
];

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  aiSeoLoading: boolean;
  aiImproveLoading?: boolean;
  onGenerateSeo: () => void;
  onImproveWithAi?: (fields: string[]) => void;
  canEditSeo: boolean;
  improveOpen: boolean;
  setImproveOpen: (fn: (v: boolean) => boolean) => void;
  improveFields: string[];
  setImproveFields: (fn: (prev: string[]) => string[]) => void;
}

export default function ListingExtraSeoSection({
  editing, setEditing, aiSeoLoading, aiImproveLoading, onGenerateSeo, onImproveWithAi, canEditSeo,
  improveOpen, setImproveOpen, improveFields, setImproveFields,
}: Props) {
  return (
    <>
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
                {aiSeoLoading ? 'Генерация...' : 'SEO Title'}
              </button>
            </div>
          </div>

          {/* Панель «Улучшить с ИИ» */}
          {improveOpen && onImproveWithAi && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                <Icon name="Wand2" size={12} /> Выберите что перегенерировать
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
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
                onClick={() => { onImproveWithAi(improveFields); setImproveOpen(() => false); }}
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
    </>
  );
}
