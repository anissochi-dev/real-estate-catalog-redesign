import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { District, FormState, BLANK_FORM } from './DistrictsTypes';

export function AddForm({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="PlusCircle" size={16} className="text-brand-blue" />
        <span className="font-semibold text-sm text-brand-blue">Новый район</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
            Название <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set({ name: e.target.value })}
            placeholder="Центральный район"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
            Город <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.city}
            onChange={e => set({ city: e.target.value })}
            placeholder="Краснодар"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
            Порядок сортировки
          </label>
          <input
            type="number"
            value={form.sort_order}
            onChange={e => set({ sort_order: Number(e.target.value) })}
            min={0}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
          Описание
        </label>
        <textarea
          value={form.description}
          onChange={e => set({ description: e.target.value })}
          rows={2}
          placeholder="Краткое описание района (опционально)"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim() || !form.city.trim()}
          className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Icon name={saving ? 'Loader2' : 'Check'} size={14} className={saving ? 'animate-spin' : ''} />
          {saving ? 'Сохраняем...' : 'Добавить район'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50"
        >
          Отмена
        </button>
        <span className="text-xs text-muted-foreground ml-1">
          Slug будет сгенерирован автоматически
        </span>
      </div>
    </div>
  );
}

export function EditRow({
  district,
  onSave,
  onCancel,
  saving,
}: {
  district: District;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormState>({
    name: district.name,
    slug: district.slug,
    city: district.city,
    description: district.description || '',
    sort_order: district.sort_order,
  });
  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  return (
    <tr className="bg-blue-50/60 border-b border-blue-100">
      <td colSpan={7} className="px-4 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
              Slug
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={e => set({ slug: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
              Город <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.city}
              onChange={e => set({ city: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
              Порядок сортировки
            </label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => set({ sort_order: Number(e.target.value) })}
              min={0}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">
              Описание
            </label>
            <textarea
              value={form.description}
              onChange={e => set({ description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim() || !form.city.trim()}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Icon name={saving ? 'Loader2' : 'Check'} size={14} className={saving ? 'animate-spin' : ''} />
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            Отмена
          </button>
        </div>
      </td>
    </tr>
  );
}
