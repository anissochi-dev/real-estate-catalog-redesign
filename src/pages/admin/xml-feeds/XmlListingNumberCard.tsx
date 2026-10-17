import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';

export default function XmlListingNumberCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings()
      .then(d => setEnabled(d.settings?.feed_append_listing_number !== false))
      .catch(() => setEnabled(true));
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    try {
      await adminApi.updateSettings({ feed_append_listing_number: next });
      setEnabled(next);
      toast.success(next ? 'Номер объекта будет добавляться в выгрузку' : 'Номер объекта в выгрузку не добавляется');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon name="Hash" size={16} className="text-brand-blue" />
          Номер объекта в конце описания
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          В описание каждого объекта в файлах для площадок добавляется последней строкой «Объект № 230». На сайте и в самом объекте описание остаётся без номера. Изменения попадут в файлы при следующей сборке фидов.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!enabled}
        disabled={enabled === null || saving}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-brand-blue' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
