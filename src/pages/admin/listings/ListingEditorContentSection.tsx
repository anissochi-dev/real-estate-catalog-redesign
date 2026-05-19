import Icon from '@/components/ui/icon';
import { Listing, fmtDate } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  aiLoading: boolean;
  aiTagsLoading: boolean;
  aiSeoLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  onGenerateSeo: () => void;
}

export default function ListingEditorContentSection({
  editing, setEditing,
  aiLoading, aiTagsLoading, aiSeoLoading,
  onDescribe, onGenerateTags, onGenerateSeo,
}: Props) {
  return (
    <>
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
    </>
  );
}
