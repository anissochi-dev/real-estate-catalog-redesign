import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';

// ── Константы ────────────────────────────────────────────────────────────────
const ADMIN_URL = 'https://functions.poehali.dev/aeccc0fe-9c55-4933-b292-432cec9cc09d';

// ── Типы ─────────────────────────────────────────────────────────────────────
interface District {
  id: number;
  name: string;
  slug: string;
  city: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  listings_count?: number;
}

interface FormState {
  name: string;
  slug: string;
  city: string;
  description: string;
  sort_order: number;
}

const BLANK_FORM: FormState = {
  name: '',
  slug: '',
  city: '',
  description: '',
  sort_order: 0,
};

// ── Вспомогательные функции ───────────────────────────────────────────────────
function buildHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': token,
  };
}

function buildUrl(params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ resource: 'districts', ...params }).toString();
  return `${ADMIN_URL}?${qs}`;
}

// ── Бейдж количества объектов ─────────────────────────────────────────────────
function ListingsBadge({ count }: { count?: number }) {
  if (count === undefined || count === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
        —
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
        <Icon name="Home" size={11} />
        {count}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Home" size={11} />
      0
    </span>
  );
}

// ── Переключатель is_active ───────────────────────────────────────────────────
function ActiveToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
        value ? 'bg-emerald-500' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Inline-форма добавления ───────────────────────────────────────────────────
function AddForm({
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

// ── Строка редактирования (inline expand) ─────────────────────────────────────
function EditRow({
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
              className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/30 bg-white"
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

// ── Основной компонент ────────────────────────────────────────────────────────
export default function DistrictsAdmin() {
  const { refreshToken } = useAuth();

  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Форма добавления
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  // Редактирование строки
  const [editId, setEditId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Toggle активности
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Удаление
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Загрузка ────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), {
        method: 'GET',
        headers: buildHeaders(tok),
      });
      if (!res.ok) {
        throw new Error(`Ошибка сервера: ${res.status}`);
      }
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));
      const list: District[] = Array.isArray(data?.districts)
        ? data.districts
        : Array.isArray(data)
        ? data
        : [];
      setDistricts(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Добавление ──────────────────────────────────────────────────────────────
  const handleAdd = async (form: FormState) => {
    setAddSaving(true);
    try {
      const tok = refreshToken();
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        city: form.city.trim(),
        sort_order: form.sort_order,
      };
      if (form.description.trim()) body.description = form.description.trim();

      const res = await fetch(buildUrl(), {
        method: 'POST',
        headers: buildHeaders(tok),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));

      toast.success(`Район «${form.name}» добавлен`);
      setShowAddForm(false);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось добавить';
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  };

  // ── Редактирование ──────────────────────────────────────────────────────────
  const handleEdit = async (district: District, form: FormState) => {
    setEditSaving(true);
    try {
      const tok = refreshToken();
      const body: Record<string, unknown> = {
        id: district.id,
        name: form.name.trim(),
        slug: form.slug.trim(),
        city: form.city.trim(),
        description: form.description.trim(),
        sort_order: form.sort_order,
      };

      const res = await fetch(buildUrl(), {
        method: 'PUT',
        headers: buildHeaders(tok),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));

      toast.success(`Район «${form.name}» обновлён`);
      setEditId(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setEditSaving(false);
    }
  };

  // ── Переключение is_active ──────────────────────────────────────────────────
  const handleToggleActive = async (district: District) => {
    setTogglingId(district.id);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), {
        method: 'PUT',
        headers: buildHeaders(tok),
        body: JSON.stringify({ id: district.id, is_active: !district.is_active }),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));

      setDistricts(ds =>
        ds.map(d => d.id === district.id ? { ...d, is_active: !d.is_active } : d)
      );
      toast.success(
        !district.is_active
          ? `Район «${district.name}» активирован`
          : `Район «${district.name}» скрыт`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось изменить';
      toast.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Удаление ────────────────────────────────────────────────────────────────
  const handleDelete = async (district: District) => {
    const hasListings = (district.listings_count ?? 0) > 0;
    const confirmText = hasListings
      ? `Удалить район «${district.name}»?\n\nВНИМАНИЕ: у этого района ${district.listings_count} объект(ов). После удаления они останутся связаны с этим районом в базе данных.`
      : `Удалить район «${district.name}»? Это действие нельзя отменить.`;

    if (!window.confirm(confirmText)) return;

    setDeletingId(district.id);
    try {
      const tok = refreshToken();
      const res = await fetch(buildUrl(), {
        method: 'DELETE',
        headers: buildHeaders(tok),
        body: JSON.stringify({ id: district.id }),
      });
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(String(data.error));

      setDistricts(ds => ds.filter(d => d.id !== district.id));
      toast.success(`Район «${district.name}» удалён`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось удалить';
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Рендер ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Заголовок */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-xl flex items-center gap-2">
            <Icon name="MapPin" size={20} className="text-brand-blue" />
            Районы города
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Управление районами для фильтрации и группировки объектов
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted/50 transition disabled:opacity-50"
          >
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={14} className={loading ? 'animate-spin' : ''} />
            Обновить
          </button>

          {!showAddForm && (
            <button
              type="button"
              onClick={() => { setShowAddForm(true); setEditId(null); }}
              className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <Icon name="Plus" size={14} />
              Добавить район
            </button>
          )}
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Icon name="AlertCircle" size={16} />
          {error}
        </div>
      )}

      {/* Inline-форма добавления */}
      {showAddForm && (
        <AddForm
          onSave={handleAdd}
          onCancel={() => setShowAddForm(false)}
          saving={addSaving}
        />
      )}

      {/* Карточка с таблицей */}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">

        {/* Счётчик */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="List" size={14} />
          {loading ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="Loader2" size={12} className="animate-spin" /> Загрузка...
            </span>
          ) : (
            <span>Всего районов: <strong className="text-foreground">{districts.length}</strong></span>
          )}
        </div>

        {/* Таблица */}
        {!loading && districts.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Icon name="MapPin" size={40} className="opacity-20" />
            <p className="text-sm">Районов пока нет. Добавьте первый.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-semibold">Название</th>
                  <th className="text-left px-4 py-3 font-semibold">Slug</th>
                  <th className="text-left px-4 py-3 font-semibold">Город</th>
                  <th className="text-center px-4 py-3 font-semibold">Объекты</th>
                  <th className="text-center px-4 py-3 font-semibold">Активен</th>
                  <th className="text-center px-4 py-3 font-semibold">Порядок</th>
                  <th className="text-right px-4 py-3 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {districts.map(district => {
                  const isEditing = editId === district.id;
                  const isDeleting = deletingId === district.id;
                  const isToggling = togglingId === district.id;

                  if (isEditing) {
                    return (
                      <EditRow
                        key={district.id}
                        district={district}
                        onSave={form => handleEdit(district, form)}
                        onCancel={() => setEditId(null)}
                        saving={editSaving}
                      />
                    );
                  }

                  return (
                    <tr
                      key={district.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/40 transition-colors ${
                        isDeleting ? 'opacity-40 pointer-events-none' : ''
                      }`}
                    >
                      {/* Название */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{district.name}</span>
                          {district.description && (
                            <span
                              className="text-muted-foreground/60"
                              title={district.description}
                            >
                              <Icon name="Info" size={13} />
                            </span>
                          )}
                        </div>
                        {district.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-xs">
                            {district.description}
                          </p>
                        )}
                      </td>

                      {/* Slug */}
                      <td className="px-4 py-3">
                        <code className="text-xs font-mono bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                          {district.slug}
                        </code>
                      </td>

                      {/* Город */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Icon name="Building2" size={13} className="text-muted-foreground" />
                          {district.city}
                        </span>
                      </td>

                      {/* Объекты */}
                      <td className="px-4 py-3 text-center">
                        <ListingsBadge count={district.listings_count} />
                      </td>

                      {/* Активен */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <ActiveToggle
                            value={district.is_active}
                            disabled={isToggling}
                            onChange={() => handleToggleActive(district)}
                          />
                        </div>
                      </td>

                      {/* Порядок */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-mono text-muted-foreground">
                          {district.sort_order}
                        </span>
                      </td>

                      {/* Действия */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditId(district.id); setShowAddForm(false); }}
                            disabled={editSaving || isDeleting}
                            title="Редактировать"
                            className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition disabled:opacity-40"
                          >
                            <Icon name="Pencil" size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(district)}
                            disabled={isDeleting || editSaving}
                            title="Удалить"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition disabled:opacity-40"
                          >
                            {isDeleting
                              ? <Icon name="Loader2" size={14} className="animate-spin" />
                              : <Icon name="Trash2" size={14} />
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
