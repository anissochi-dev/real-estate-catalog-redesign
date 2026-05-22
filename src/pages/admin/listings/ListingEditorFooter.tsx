import Icon from '@/components/ui/icon';
import { Listing } from './types';
import { EDITOR_TABS, EditorTab } from './ListingEditorHeader';
import { SOCIAL_POST_URL, getToken } from '@/lib/adminApi';
import { toast } from 'sonner';
import { useState } from 'react';

interface Props {
  editing: Partial<Listing>;
  tab: EditorTab;
  setTab: (t: EditorTab) => void;
  tabErrors: Partial<Record<EditorTab, boolean>>;
  onClose: () => void;
  onSave: () => void;
}

export default function ListingEditorFooter({ editing, tab, setTab, tabErrors, onClose, onSave }: Props) {
  const [posting, setPosting] = useState(false);

  const postToSocials = async () => {
    if (!editing.id) return;
    setPosting(true);
    try {
      const r = await fetch(SOCIAL_POST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({ action: 'post', entity_type: 'listing', entity_id: editing.id }),
      });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      const results: { platform: string; label: string; ok?: boolean; manual?: boolean; error?: string }[] = d.results || [];
      const ok = results.filter(r => r.ok).length;
      const manual = results.filter(r => r.manual).length;
      const fail = results.filter(r => r.error).length;
      if (ok > 0 || manual > 0) toast.success(`Опубликовано: ${ok} авто, ${manual} для ручной публикации${fail > 0 ? `, ошибок: ${fail}` : ''}`);
      else if (fail > 0) toast.error(`Ошибки публикации: ${fail}`);
      else toast.info('Нет включённых платформ с автопостингом для объектов');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="p-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0">
      <div className="flex gap-2">
        {editing.id && (
          <button onClick={postToSocials} disabled={posting}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2 transition">
            {posting ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Share2" size={14} />}
            В соцсети
          </button>
        )}
      </div>
      <div className="flex gap-3 items-center">
        {/* Индикатор прогресса вкладок */}
        <div className="hidden sm:flex items-center gap-1">
          {EDITOR_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-2 h-2 rounded-full transition-colors ${tab === t.id ? 'bg-brand-blue' : tabErrors[t.id] ? 'bg-red-400' : 'bg-border'}`}
              title={t.label}
            />
          ))}
        </div>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm">Отмена</button>
        <button onClick={onSave} className="btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold">
          Сохранить
        </button>
      </div>
    </div>
  );
}
