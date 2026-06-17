import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { EDITOR_TABS, EditorTab } from './ListingEditorHeader';

interface Props {
  editing: Partial<Listing>;
  tab: EditorTab;
  setTab: (t: EditorTab) => void;
  tabErrors: Partial<Record<EditorTab, boolean>>;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  savingLabel?: string;
}

export default function ListingEditorFooter({ editing, tab, setTab, tabErrors, onClose, onSave, saving, savingLabel }: Props) {
  return (
    <div className="p-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0">
      <div className="flex gap-2">
        {/* Кнопка «В соцсети» временно скрыта — модуль автопостинга на обслуживании */}
      </div>
      <div className="flex gap-3 items-center">
        <div className="hidden sm:flex items-center gap-1">
          {EDITOR_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-2 h-2 rounded-full transition-colors ${tab === t.id ? 'bg-brand-blue' : tabErrors[t.id] ? 'bg-red-400' : 'bg-border'}`}
              title={t.label}
            />
          ))}
        </div>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving && <Icon name="Loader2" size={14} className="animate-spin" />}
          {saving && savingLabel ? savingLabel : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}