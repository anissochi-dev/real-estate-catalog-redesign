import Icon from '@/components/ui/icon';
import { Listing } from './types';
import MelaPriceCheck from './MelaPriceCheck';

export type EditorTab = 'main' | 'photos' | 'location' | 'details' | 'content' | 'extra';

export const EDITOR_TABS: { id: EditorTab; label: string; icon: string }[] = [
  { id: 'main',     label: 'Основное',       icon: 'FileText' },
  { id: 'photos',   label: 'Фото',           icon: 'Image' },
  { id: 'location', label: 'Расположение',   icon: 'MapPin' },
  { id: 'details',  label: 'Характеристики', icon: 'Settings2' },
  { id: 'content',  label: 'Описание',       icon: 'AlignLeft' },
  { id: 'extra',    label: 'Дополнительное', icon: 'Layers' },
];

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  tab: EditorTab;
  setTab: (t: EditorTab) => void;
  tabErrors: Partial<Record<EditorTab, boolean>>;
  hasErrors: boolean;
  aiAllLoading: boolean;
  onGenerateAll: () => void;
  onClose: () => void;
}

export default function ListingEditorHeader({
  editing, setEditing, tab, setTab, tabErrors, hasErrors,
  aiAllLoading, onGenerateAll, onClose,
}: Props) {
  return (
    <>
      {/* Шапка */}
      <div className="p-4 border-b border-border flex justify-between items-center gap-3 flex-shrink-0">
        <div className="font-display font-700 text-lg flex items-center gap-2 flex-wrap">
          {editing.id ? 'Редактировать' : 'Новый объект'}
          {editing.public_code ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue">
              ID: {editing.public_code}
            </span>
          ) : null}
          {/* Виртуальный брокер: анализ цены — между названием и кнопкой видимости */}
          <MelaPriceCheck
            editing={editing}
            onApplySuggested={(price) => setEditing({ ...editing, price })}
          />
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => setEditing({ ...editing, is_visible: !(editing.is_visible !== false) })}
            title={editing.is_visible !== false ? 'Объект виден на сайте' : 'Объект скрыт с сайта'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              editing.is_visible !== false
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}>
            <Icon name={editing.is_visible !== false ? 'Eye' : 'EyeOff'} size={13} />
            {editing.is_visible !== false ? 'Виден' : 'Скрыт'}
          </button>
          <button type="button" onClick={onGenerateAll} disabled={aiAllLoading}
            className="btn-orange text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            <Icon name={aiAllLoading ? 'Loader2' : 'Sparkles'} size={13} className={aiAllLoading ? 'animate-spin' : ''} />
            {aiAllLoading ? 'Генерация...' : 'ИИ'}
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <Icon name="X" size={20} />
          </button>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
        {EDITOR_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors relative ${
              tab === t.id
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
            {tabErrors[t.id] && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 absolute top-2 right-2" />
            )}
          </button>
        ))}
      </div>

      {/* Баннер ошибок */}
      {hasErrors && (
        <div className="px-5 pt-3 flex-shrink-0">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex items-center gap-2">
            <Icon name="AlertCircle" size={15} className="flex-shrink-0" />
            Заполните обязательные поля — вкладки с ошибками отмечены красной точкой
          </div>
        </div>
      )}
    </>
  );
}