import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';
import { useSettings } from '@/contexts/SettingsContext';
import { HIDDEN_UI_REGISTRY, HiddenUiItem, parseHiddenUi, serializeHiddenUi, setHiddenUi } from '@/lib/hiddenUi';
import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (fn: (prev: Partial<S>) => Partial<S>) => void;
}

/** Настройки → Администрирование → Скрытые: что скрыто в админке, где стояло, что делало, и восстановление. */
export default function HiddenUiTab({ s, setS }: Props) {
  const { reload } = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const hidden = parseHiddenUi(s.hidden_ui);

  const toggle = async (id: string, hide: boolean) => {
    const next = serializeHiddenUi(hide ? [...hidden, id] : hidden.filter(x => x !== id));
    setBusy(id);
    try {
      await adminApi.updateSettings({ hidden_ui: next });
      setS(prev => ({ ...prev, hidden_ui: next }));
      setHiddenUi(next);
      await reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(null);
    }
  };

  const hiddenItems = HIDDEN_UI_REGISTRY.filter(i => hidden.includes(i.id));
  const activeItems = HIDDEN_UI_REGISTRY.filter(i => !hidden.includes(i.id));

  const card = (item: HiddenUiItem, isHidden: boolean) => (
    <div key={item.id} className="bg-white border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={isHidden ? 'EyeOff' : 'Eye'} size={16} className={isHidden ? 'text-muted-foreground' : 'text-emerald-600'} />
          <div className="font-semibold text-sm">{item.title}</div>
        </div>
        <button type="button" disabled={busy === item.id} onClick={() => toggle(item.id, !isHidden)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
            isHidden ? 'bg-brand-blue text-white hover:opacity-90' : 'border border-border hover:bg-muted'}`}>
          <Icon name={busy === item.id ? 'Loader2' : isHidden ? 'RotateCcw' : 'EyeOff'} size={13} className={busy === item.id ? 'animate-spin' : ''} />
          {isHidden ? 'Восстановить' : 'Скрыть'}
        </button>
      </div>
      <div className="text-xs space-y-1">
        <div className="flex gap-1.5"><span className="text-muted-foreground shrink-0">Где стоял:</span><span>{item.location}</span></div>
        <div className="flex gap-1.5"><span className="text-muted-foreground shrink-0">Что делал:</span><span>{item.purpose}</span></div>
      </div>
      {item.section && (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('admin:open-section', { detail: item.section }))}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline">
          <Icon name="ArrowUpRight" size={12} /> Показать, где стоял
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="text-sm text-muted-foreground">
        Здесь собраны элементы админки, которые скрыты, чтобы не мешать. Данные при скрытии не удаляются — нажмите «Восстановить», и элемент вернётся на место для всех сотрудников.
      </div>

      <section className="space-y-2">
        <div className="text-sm font-semibold">Скрытые ({hiddenItems.length})</div>
        {hiddenItems.length ? hiddenItems.map(i => card(i, true)) : (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-4 text-center">Ничего не скрыто</div>
        )}
      </section>

      {activeItems.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm font-semibold">Активные ({activeItems.length})</div>
          {activeItems.map(i => card(i, false))}
        </section>
      )}
    </div>
  );
}
