import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';
import { adminApi } from '@/lib/adminApi';
import { ElementId } from './QrBannerTypes';

export interface TemplateElement { id: ElementId; x_cm: number; y_cm: number; size_cm: number; manual: boolean }
export interface QrTemplate {
  id: number;
  name: string;
  width_cm: number;
  height_cm: number;
  created_by_name?: string;
  config: {
    bg_color: string;
    text_color: string;
    show_size: boolean;
    logo_url: string;
    elements: TemplateElement[];
  };
}

interface Props {
  onApply: (t: QrTemplate) => void;
  buildTemplate: () => Record<string, unknown>;
  widthCm: number;
  heightCm: number;
}

const fmt = (v: number) => String(v).replace('.', ',');

export function TemplatesPanel({ onApply, buildTemplate, widthCm, heightCm }: Props) {
  const [items, setItems] = useState<QrTemplate[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    adminApi.listQrTemplates()
      .then(r => { setItems(r.templates || []); setCanManage(!!r.can_manage); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    const n = name.trim();
    if (!n) { setError('Введите название шаблона'); return; }
    setSaving(true); setError('');
    try {
      await adminApi.createQrTemplate({ ...buildTemplate(), name: n });
      setName('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally { setSaving(false); }
  };

  const remove = async (t: QrTemplate) => {
    if (!confirm(`Удалить шаблон «${t.name}»?`)) return;
    setDeletingId(t.id); setError('');
    try {
      await adminApi.deleteQrTemplate(t.id);
      setItems(prev => prev.filter(i => i.id !== t.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить');
    } finally { setDeletingId(null); }
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon name="LayoutTemplate" size={15} className="text-brand-blue" />
        <span className="text-sm font-semibold">Шаблоны</span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Icon name="Loader2" size={12} className="animate-spin" />Загрузка...
        </div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">Шаблонов пока нет</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(t => (
            <div key={t.id} className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
              <span className="w-4 h-4 rounded flex-shrink-0 border border-border" style={{ background: t.config?.bg_color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{t.name}</div>
                <div className="text-xs text-muted-foreground">{fmt(t.width_cm)} × {fmt(t.height_cm)} см</div>
              </div>
              <button onClick={() => { onApply(t); setAppliedId(t.id); }}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  appliedId === t.id ? 'bg-brand-blue text-white border-brand-blue' : 'border-brand-blue text-brand-blue hover:bg-brand-blue/5'
                }`}
              >
                <Icon name={appliedId === t.id ? 'Check' : 'Wand2'} size={12} />
                {appliedId === t.id ? 'Применён' : 'Применить'}
              </button>
              {canManage && (
                <button onClick={() => remove(t)} disabled={deletingId === t.id} title="Удалить шаблон"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Icon name={deletingId === t.id ? 'Loader2' : 'Trash2'} size={14} className={deletingId === t.id ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2 pt-1">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
            placeholder={`Название, например «Стандарт ${fmt(widthCm)}×${fmt(heightCm)}»`}
            className="flex-1 min-w-0 px-3 py-2 border border-border rounded-lg text-sm focus:border-brand-blue outline-none" />
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50 flex-shrink-0"
          >
            <Icon name={saving ? 'Loader2' : 'Save'} size={14} className={saving ? 'animate-spin' : ''} />
            Сохранить
          </button>
        </div>
      )}

      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="text-xs text-muted-foreground">
        {canManage
          ? 'Шаблон запоминает размер, расположение элементов, цвета и логотип. Телефон и QR подставляются из объекта.'
          : 'Примените шаблон и при необходимости поправьте баннер вручную.'}
      </div>
    </div>
  );
}
