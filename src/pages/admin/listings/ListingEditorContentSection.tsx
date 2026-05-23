import Icon from '@/components/ui/icon';
import CharCount from '@/components/ui/CharCount';
import { Listing, fmtDate } from './types';

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  aiLoading: boolean;
  aiTagsLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function ListingEditorContentSection({
  editing, setEditing,
  aiLoading, aiTagsLoading,
  onDescribe, onGenerateTags,
  errors = {}, setErrors,
}: Props) {
  const descLen = (editing.description || '').trim().length;
  const descError = !!errors.description;
  return (
    <>
      <div className="space-y-1" data-field-error={descError ? 'true' : undefined}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold flex items-center gap-1.5">
            Описание <span className="text-red-500">*</span>
            {descError && (
              <span className="text-xs font-normal text-red-600 inline-flex items-center gap-1">
                <Icon name="AlertCircle" size={11} />
                обязательно, минимум 30 символов
              </span>
            )}
          </label>
          <button onClick={onDescribe} disabled={aiLoading}
            className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
            <Icon name="Sparkles" size={12} />
            {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
          </button>
        </div>
        <div className={descError ? 'rounded-lg ring-2 ring-red-300' : ''}>
          <CharCount as="textarea" rows={6} max={3000} warnAt={2500}
            value={editing.description || ''}
            onChange={e => {
              setEditing({ ...editing, description: (e.target as HTMLTextAreaElement).value });
              if (descError) setErrors?.(v => ({ ...v, description: false }));
            }} />
        </div>
        {!descError && descLen > 0 && descLen < 30 && (
          <div className="text-[11px] text-amber-600">
            Ещё {30 - descLen} симв. до минимума.
          </div>
        )}
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

      {editing.id && (
        <div className="text-xs text-muted-foreground border-t border-border pt-3">
          Создан: {fmtDate(editing.created_at as string)} ·
          Обновлён: {fmtDate(editing.updated_at as string)}
        </div>
      )}
    </>
  );
}