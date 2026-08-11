import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';

const PLATFORMS = [
  { id: 'cian', label: 'Циан', icon: 'Building2' },
  { id: 'domclick', label: 'ДомКлик', icon: 'MousePointer' },
  { id: 'yandex', label: 'Яндекс.Недвижимость', icon: 'Home' },
  { id: 'avito', label: 'Авито', icon: 'ShoppingBag' },
];

const DEAL_TYPES = [
  { id: 'rent', label: 'Аренда' },
  { id: 'sale', label: 'Продажа' },
] as const;

// Формат хранения в одном текстовом поле: "cian_rent: описание||cian_sale: описание||..."
function parseNotes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw) return result;
  raw.split('||').forEach(chunk => {
    const idx = chunk.indexOf(':');
    if (idx === -1) return;
    const key = chunk.slice(0, idx).trim();
    const val = chunk.slice(idx + 1).trim();
    if (key) result[key] = val;
  });
  return result;
}

function serializeNotes(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join('||');
}

export default function ExportPricingTab() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings()
      .then(d => setNotes(parseNotes(d.settings?.export_pricing_notes || '')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings({ export_pricing_notes: serializeNotes(notes) });
      toast.success('Заметки о стоимости размещения сохранены');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Icon name="Loader2" size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
            <Icon name="Tag" size={19} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Прайс размещения на площадках</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ни одна площадка не отдаёт точную цену размещения по API — заполните ориентировочные тарифы вручную,
              отдельно для аренды и продажи. Эти заметки будут видны директору в окне одобрения заявки брокера.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4 space-y-5">
        {PLATFORMS.map(p => (
          <div key={p.id}>
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Icon name={p.icon} size={14} className="text-brand-blue" />
              {p.label}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEAL_TYPES.map(d => {
                const key = `${p.id}_${d.id}`;
                return (
                  <div key={key}>
                    <div className="text-xs text-muted-foreground mb-1">{d.label}</div>
                    <input
                      value={notes[key] || ''}
                      onChange={e => setNotes(n => ({ ...n, [key]: e.target.value }))}
                      placeholder={d.id === 'rent' ? 'например: подсветка от 500 ₽/мес' : 'например: топ-3 от 1500 ₽/мес'}
                      className="w-full px-3 py-2.5 border border-border rounded-xl text-sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button
          onClick={save}
          disabled={saving}
          className="mt-1 btn-blue text-white px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
          Сохранить
        </button>
      </div>
    </div>
  );
}
