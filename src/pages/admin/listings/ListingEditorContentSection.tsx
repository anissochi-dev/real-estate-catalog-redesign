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
}

export default function ListingEditorContentSection({
  editing, setEditing,
  aiLoading, aiTagsLoading,
  onDescribe, onGenerateTags,
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
        <CharCount as="textarea" rows={6} max={3000} warnAt={2500}
          value={editing.description || ''} onChange={e => setEditing({ ...editing, description: (e.target as HTMLTextAreaElement).value })} />
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
